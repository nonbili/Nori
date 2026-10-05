package jp.nonbili.nori.filesave

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch
import java.io.IOException

private const val CREATE_DOCUMENT_CODE = 4291

class NoriFileSaveModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingContent: String? = null

  override fun definition() = ModuleDefinition {
    Name("NoriFileSave")

    // Resolves true once the text is written, false when the picker is dismissed.
    AsyncFunction("saveTextFile") { filename: String, mimeType: String, content: String, promise: Promise ->
      if (pendingPromise != null) {
        throw CodedException("ERR_SAVE_IN_PROGRESS", "Another file is already being saved", null)
      }

      pendingPromise = promise
      pendingContent = content
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
        putExtra(Intent.EXTRA_TITLE, filename)
      }
      try {
        appContext.throwingActivity.startActivityForResult(intent, CREATE_DOCUMENT_CODE)
      } catch (e: Exception) {
        pendingPromise = null
        pendingContent = null
        throw e
      }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != CREATE_DOCUMENT_CODE) {
        return@OnActivityResult
      }

      val promise = pendingPromise ?: return@OnActivityResult
      val content = pendingContent ?: ""
      pendingPromise = null
      pendingContent = null

      val uri = intent?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(false)
        return@OnActivityResult
      }

      // Activity results arrive on the main thread; a USB or cloud provider can be slow.
      appContext.backgroundCoroutineScope.launch {
        try {
          val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
          // "wt" truncates, so replacing an existing longer file leaves no stale tail.
          val stream = context.contentResolver.openOutputStream(uri, "wt")
            ?: throw IOException("Could not open $uri for writing")
          stream.use { it.write(content.toByteArray(Charsets.UTF_8)) }
          promise.resolve(true)
        } catch (e: Exception) {
          promise.reject(e.toCodedException())
        }
      }
    }
  }
}
