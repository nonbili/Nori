package jp.nonbili.nori.quickshare

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import java.time.Instant
import java.util.UUID

private const val PREFS_NAME = "nori_quick_share"
private const val KEY_ENABLED = "quick_save_enabled"
private const val KEY_TARGET_LIST_ID = "quick_save_target_list_id"
private const val KEY_INBOX = "quick_share_inbox"
private const val KEY_APP_INBOX = "app_share_inbox"

class QuickShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val result = handleShare(intent)
    if (result == ShareResult.QuickSaved) {
      Toast.makeText(this, "Bookmark saved", Toast.LENGTH_SHORT).show()
      finish()
      return
    }

    forwardToMainActivity(intent)
    finish()
  }

  private fun handleShare(intent: Intent): ShareResult {
    if (intent.action != Intent.ACTION_SEND) {
      return ShareResult.OpenApp
    }

    val url = extractUrl(intent) ?: return ShareResult.OpenApp
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val targetListId = prefs.getString(KEY_TARGET_LIST_ID, "") ?: ""
    val canQuickSave = prefs.getBoolean(KEY_ENABLED, false) && targetListId.isNotBlank()
    appendLink(prefs, if (canQuickSave) KEY_INBOX else KEY_APP_INBOX, url, targetListId)
    return if (canQuickSave) ShareResult.QuickSaved else ShareResult.OpenApp
  }

  private fun extractUrl(intent: Intent): String? {
    val candidates = listOfNotNull(
      intent.getStringExtra(Intent.EXTRA_TEXT),
      intent.dataString,
      intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.toString(),
    )

    for (candidate in candidates) {
      val direct = candidate.trim()
      if (isHttpUrl(direct)) {
        return direct
      }

      val match = Regex("""https?://\S+""", RegexOption.IGNORE_CASE)
        .find(direct)
        ?.value
        ?.trimEnd('.', ',', ')', ']')
      if (match != null && isHttpUrl(match)) {
        return match
      }
    }

    return null
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

  private fun appendLink(prefs: android.content.SharedPreferences, key: String, url: String, targetListId: String) {
    val current = QuickShareJson.decodeInbox(prefs.getString(key, "[]") ?: "[]")
    val next = current + mapOf(
      "id" to UUID.randomUUID().toString(),
      "url" to url,
      "targetListId" to targetListId,
      "createdAt" to Instant.now().toString(),
    )
    prefs.edit().putString(key, QuickShareJson.encodeInbox(next)).apply()
  }

  private enum class ShareResult {
    QuickSaved,
    OpenApp,
  }
}
