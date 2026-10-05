package jp.nonbili.nori.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

private const val ICON_SIZE = 96
private const val MAX_ICON_BYTES = 512 * 1024
private const val RETRY_AFTER_MS = 24 * 60 * 60 * 1000L

/** Favicons for widget rows, cached on disk. Call off the main thread. */
object WidgetIcons {
  private fun cacheFile(context: Context, pageUrl: String): File {
    val directory = File(context.cacheDir, "nori-widget-icons").apply { mkdirs() }
    val digest = MessageDigest.getInstance("SHA-1").digest(pageUrl.toByteArray())
    return File(directory, digest.joinToString("") { "%02x".format(it) })
  }

  fun load(context: Context, item: WidgetItem): Bitmap? {
    val file = cacheFile(context, item.url)
    if (file.exists()) {
      if (file.length() > 0) {
        BitmapFactory.decodeFile(file.path)?.let { return it }
      } else if (System.currentTimeMillis() - file.lastModified() < RETRY_AFTER_MS) {
        // An empty file records a recent miss, so a dead icon is not refetched on every scroll.
        return null
      }
    }

    // BitmapFactory cannot read .ico or .svg, so Google's PNG rendition backs up the saved icon.
    val google = "https://www.google.com/s2/favicons?domain_url=${Uri.encode(item.url)}&sz=128"
    for (candidate in listOf(item.icon, google).filter { it.startsWith("http") }.distinct()) {
      val bitmap = download(candidate) ?: continue
      runCatching { file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
      return bitmap
    }

    runCatching {
      file.writeBytes(ByteArray(0))
      file.setLastModified(System.currentTimeMillis())
    }
    return null
  }

  private fun download(url: String): Bitmap? {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 3000
        readTimeout = 3000
        instanceFollowRedirects = true
      }
      if (connection.responseCode !in 200..299) {
        return null
      }
      val bytes = connection.inputStream.use { stream ->
        val buffer = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        while (true) {
          val read = stream.read(chunk)
          if (read < 0) break
          buffer.write(chunk, 0, read)
          if (buffer.size() > MAX_ICON_BYTES) return null
        }
        buffer.toByteArray()
      }
      val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
      if (decoded.width <= ICON_SIZE && decoded.height <= ICON_SIZE) {
        decoded
      } else {
        val scale = ICON_SIZE.toFloat() / maxOf(decoded.width, decoded.height)
        Bitmap.createScaledBitmap(
          decoded,
          maxOf(1, (decoded.width * scale).toInt()),
          maxOf(1, (decoded.height * scale).toInt()),
          true,
        )
      }
    } catch (_: Throwable) {
      null
    } finally {
      connection?.disconnect()
    }
  }
}
