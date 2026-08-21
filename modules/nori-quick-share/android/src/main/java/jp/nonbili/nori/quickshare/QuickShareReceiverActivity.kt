package jp.nonbili.nori.quickshare

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import java.time.Instant
import java.util.UUID

private const val PREFS_NAME = "nori_quick_share"
private const val KEY_ENABLED = "quick_save_enabled"
private const val KEY_TARGET_LIST_ID = "quick_save_target_list_id"
private const val KEY_INBOX = "quick_share_inbox"
private const val KEY_APP_INBOX = "app_share_inbox"

private val URL_REGEX = Regex("""https?://\S+""", RegexOption.IGNORE_CASE)

class QuickShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val result = handleShare(intent)
    if (result is ShareResult.QuickSaved) {
      val message = if (result.count > 1) "${result.count} bookmarks saved" else "Bookmark saved"
      Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
      finish()
      return
    }

    forwardToMainActivity(intent)
    finish()
  }

  private fun handleShare(intent: Intent): ShareResult {
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) {
      return ShareResult.OpenApp
    }

    val urls = extractUrls(intent)
    if (urls.isEmpty()) {
      return ShareResult.OpenApp
    }

    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val targetListId = prefs.getString(KEY_TARGET_LIST_ID, "") ?: ""
    val canQuickSave = prefs.getBoolean(KEY_ENABLED, false) && targetListId.isNotBlank()
    appendLinks(prefs, if (canQuickSave) KEY_INBOX else KEY_APP_INBOX, urls, targetListId)
    return if (canQuickSave) ShareResult.QuickSaved(urls.size) else ShareResult.OpenApp
  }

  /**
   * Collects every http(s) link the share carries. A single share can hold many links:
   * ACTION_SEND_MULTIPLE puts them in list extras, and apps like Samsung Internet send
   * several tabs as one newline separated ACTION_SEND text.
   */
  private fun extractUrls(intent: Intent): List<String> {
    val candidates = mutableListOf<String>()

    intent.getStringExtra(Intent.EXTRA_TEXT)?.let(candidates::add)
    intent.getCharSequenceArrayListExtra(Intent.EXTRA_TEXT)
      ?.forEach { candidates.add(it.toString()) }
    intent.dataString?.let(candidates::add)
    streamExtras(intent).forEach { candidates.add(it.toString()) }
    intent.clipData?.let { clip ->
      for (index in 0 until clip.itemCount) {
        val item: ClipData.Item = clip.getItemAt(index)
        item.text?.let { candidates.add(it.toString()) }
        item.uri?.let { candidates.add(it.toString()) }
      }
    }

    val urls = LinkedHashSet<String>()
    for (candidate in candidates) {
      val direct = candidate.trim()
      // Only treat the whole payload as a URL when it can't hold several: Uri.parse
      // happily accepts a newline separated list and would collapse it into one link.
      if (direct.none { it.isWhitespace() } && isHttpUrl(direct)) {
        urls.add(direct)
        continue
      }

      URL_REGEX.findAll(direct).forEach { match ->
        val url = match.value.trimEnd('.', ',', ')', ']')
        if (isHttpUrl(url)) {
          urls.add(url)
        }
      }
    }

    return urls.toList()
  }

  @Suppress("DEPRECATION")
  private fun streamExtras(intent: Intent): List<Uri> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)) +
        (intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList())
    } else {
      listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)) +
        (intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList())
    }
  }

  private fun isHttpUrl(value: String): Boolean {
    return try {
      val uri = Uri.parse(value)
      uri.scheme == "http" || uri.scheme == "https"
    } catch (_: Throwable) {
      false
    }
  }

  private fun forwardToMainActivity(original: Intent) {
    val next = Intent(original).apply {
      setClassName(this@QuickShareReceiverActivity, "${packageName}.MainActivity")
      action = Intent.ACTION_VIEW
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    startActivity(next)
  }

  private fun appendLinks(
    prefs: android.content.SharedPreferences,
    key: String,
    urls: List<String>,
    targetListId: String,
  ) {
    val current = QuickShareJson.decodeInbox(prefs.getString(key, "[]") ?: "[]")
    val next = current + urls.map { url ->
      mapOf(
        "id" to UUID.randomUUID().toString(),
        "url" to url,
        "targetListId" to targetListId,
        "createdAt" to Instant.now().toString(),
      )
    }
    prefs.edit().putString(key, QuickShareJson.encodeInbox(next)).apply()
  }

  private sealed class ShareResult {
    data class QuickSaved(val count: Int) : ShareResult()
    object OpenApp : ShareResult()
  }
}
