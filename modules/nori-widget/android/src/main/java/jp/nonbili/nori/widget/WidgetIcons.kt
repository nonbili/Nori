package jp.nonbili.nori.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

// Rows draw favicons at 24dp. The launcher holds every row's bitmap at once, so stay small.
private const val ICON_SIZE = 72
private const val MAX_ICON_BYTES = 512 * 1024
// Three pixels per dp of the 76x56dp thumbnail slot.
const val PREVIEW_WIDTH = 228
const val PREVIEW_HEIGHT = 168
private const val PREVIEW_MIN_WIDTH = 108
private const val PREVIEW_MIN_HEIGHT = 80
// RGB_565: thumbnails are opaque, and two bytes a pixel doubles how many fit the budget.
private const val PREVIEW_BYTES_PER_PIXEL = 2
private const val PREVIEW_DIRECTORY = "bookmark-previews"
private val SAFE_FILE_NAME = Regex("^[a-zA-Z0-9.-]+$")
private const val RETRY_AFTER_MS = 24 * 60 * 60 * 1000L

/** Favicons and preview thumbnails for widget rows. Call off the main thread. */
object WidgetIcons {
  private fun cacheFile(context: Context, pageUrl: String): File {
    val directory = File(context.cacheDir, "nori-widget-icons").apply { mkdirs() }
    val digest = MessageDigest.getInstance("SHA-1").digest(pageUrl.toByteArray())
    return File(directory, digest.joinToString("") { "%02x".format(it) })
  }

  /** The favicon already on disk, if any. Never touches the network. */
  fun cached(context: Context, item: WidgetItem): Bitmap? {
    val file = cacheFile(context, item.url)
    return if (file.length() > 0) BitmapFactory.decodeFile(file.path) else null
  }

  /** Downloads a favicon that is not on disk yet. Returns true when a new one was stored. */
  fun fetch(context: Context, item: WidgetItem): Boolean {
    val file = cacheFile(context, item.url)
    if (file.exists()) {
      // An empty file records a recent miss, so a dead icon is not refetched on every refresh.
      if (file.length() > 0 || System.currentTimeMillis() - file.lastModified() < RETRY_AFTER_MS) {
        return false
      }
    }

    // BitmapFactory cannot read .ico or .svg, so Google's PNG rendition backs up the saved icon.
    val google = "https://www.google.com/s2/favicons?domain_url=${Uri.encode(item.url)}&sz=128"
    for (candidate in listOf(item.icon, google).filter { it.startsWith("http") }.distinct()) {
      val bitmap = download(candidate) ?: continue
      val stored = runCatching { file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
      return stored.isSuccess
    }

    runCatching {
      file.writeBytes(ByteArray(0))
      file.setLastModified(System.currentTimeMillis())
    }
    return false
  }

  /**
   * Thumbnail size for a list of [count] rows. Android converts the whole list to bitmaps
   * up front and drops every row after its budget (about 5.4 bytes per screen pixel) runs
   * out, so long lists get proportionally smaller thumbnails rather than missing rows.
   */
  fun previewSize(context: Context, count: Int): Pair<Int, Int> {
    val metrics = context.resources.displayMetrics
    // Part of the budget only, leaving room for favicon fallbacks and system overhead.
    val budget = metrics.widthPixels.toLong() * metrics.heightPixels * 3
    val full = PREVIEW_WIDTH * PREVIEW_HEIGHT * PREVIEW_BYTES_PER_PIXEL
    val factor = Math.sqrt(minOf(1.0, budget.toDouble() / maxOf(1, count) / full))
    // The floor keeps a thumbnail above the 16 KB that would put it inside the row's parcel.
    return Pair(
      maxOf(PREVIEW_MIN_WIDTH, (PREVIEW_WIDTH * factor).toInt()),
      maxOf(PREVIEW_MIN_HEIGHT, (PREVIEW_HEIGHT * factor).toInt()),
    )
  }

  fun loadPreview(context: Context, item: WidgetItem, width: Int, height: Int): Bitmap? {
    if (!SAFE_FILE_NAME.matches(item.preview)) {
      return null
    }
    return try {
      val directory = File(context.filesDir, PREVIEW_DIRECTORY)
      val record = JSONObject(File(directory, item.preview).readText())
      val imageFile = record.optString("imageFile")
      if (!SAFE_FILE_NAME.matches(imageFile)) {
        return null
      }
      val path = File(directory, imageFile).path
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0) {
        return null
      }
      // Send exactly the slot's shape at the budgeted size: sample down while the image
      // still covers it, then centre-crop, which is what the row's centerCrop would show anyway.
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) {
        sample *= 2
      }
      val decoded = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: return null
      val scale = maxOf(width.toFloat() / decoded.width, height.toFloat() / decoded.height)
      val cropWidth = minOf(decoded.width, maxOf(1, (width / scale).toInt()))
      val cropHeight = minOf(decoded.height, maxOf(1, (height / scale).toInt()))
      val cropped = Bitmap.createBitmap(
        decoded,
        (decoded.width - cropWidth) / 2,
        (decoded.height - cropHeight) / 2,
        cropWidth,
        cropHeight,
      )
      // Scale small images up as well, so every thumbnail has the budgeted size.
      val sized = Bitmap.createScaledBitmap(cropped, width, height, true)
      if (sized.config == Bitmap.Config.RGB_565) sized else sized.copy(Bitmap.Config.RGB_565, false)
    } catch (_: Throwable) {
      null
    }
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
      // Always the same square, enlarging small icons and padding wide ones: a bitmap under
      // 16 KB travels inside the row's parcel, and a list of those can overrun the 800 KB
      // Android allows for it. A full square is 20 KB, so it goes through shared memory.
      val scale = ICON_SIZE.toFloat() / maxOf(decoded.width, decoded.height)
      val width = maxOf(1, (decoded.width * scale).toInt())
      val height = maxOf(1, (decoded.height * scale).toInt())
      val square = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
      Canvas(square).drawBitmap(
        decoded,
        null,
        Rect((ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, (ICON_SIZE + width) / 2, (ICON_SIZE + height) / 2),
        Paint(Paint.FILTER_BITMAP_FLAG),
      )
      square
    } catch (_: Throwable) {
      null
    } finally {
      connection?.disconnect()
    }
  }
}
