package jp.nonbili.nori.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import java.util.concurrent.Executors

// One queue for every widget, so favicon downloads never run several at a time.
private val iconExecutor = Executors.newSingleThreadExecutor()

class BookmarkWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    return BookmarkWidgetFactory(applicationContext, widgetId)
  }
}

private class BookmarkWidgetFactory(
  private val context: Context,
  private val widgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {
  private var items: List<WidgetItem> = emptyList()
  private var showFavicon = true
  private var preview = false
  private var previewSize = Pair(PREVIEW_WIDTH, PREVIEW_HEIGHT)

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val snapshot = WidgetStore.read(context)
    items = WidgetStore.resolveList(context, snapshot, widgetId)?.items ?: emptyList()
    showFavicon = snapshot.showFavicon
    preview = WidgetStore.isPreview(context, widgetId)
    previewSize = WidgetIcons.previewSize(context, items.size)
    if (showFavicon) {
      fetchMissingIcons(items)
    }
  }

  /**
   * Android 16 builds every row in one pass with a 20 second limit and shows an empty list
   * when it is missed, so rows only use icons already on disk. Missing ones are downloaded
   * here and the list refreshed once; misses are remembered, so the refresh does not loop.
   */
  private fun fetchMissingIcons(pending: List<WidgetItem>) {
    iconExecutor.execute {
      var fetched = false
      for (item in pending) {
        if (WidgetIcons.fetch(context, item)) {
          fetched = true
        }
      }
      if (fetched) {
        @Suppress("DEPRECATION")
        AppWidgetManager.getInstance(context).notifyAppWidgetViewDataChanged(widgetId, R.id.nori_widget_list)
      }
    }
  }

  override fun onDestroy() {
    items = emptyList()
  }

  override fun getCount() = items.size

  // Disk reads only: see fetchMissingIcons.
  override fun getViewAt(position: Int): RemoteViews? {
    val item = items.getOrNull(position) ?: return null
    if (preview) {
      return previewRow(item)
    }
    val views = RemoteViews(context.packageName, R.layout.nori_widget_item)
    views.setTextViewText(R.id.nori_widget_item_title, item.title)

    if (showFavicon) {
      views.setViewVisibility(R.id.nori_widget_item_icon, View.VISIBLE)
      val icon = WidgetIcons.cached(context, item)
      if (icon != null) {
        views.setImageViewBitmap(R.id.nori_widget_item_icon, icon)
      } else {
        views.setImageViewResource(R.id.nori_widget_item_icon, R.drawable.nori_widget_ic_link)
      }
    } else {
      views.setViewVisibility(R.id.nori_widget_item_icon, View.GONE)
    }

    views.setOnClickFillInIntent(R.id.nori_widget_item, Intent().setData(Uri.parse(item.url)))
    return views
  }

  private fun previewRow(item: WidgetItem): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.nori_widget_item_preview)
    views.setTextViewText(R.id.nori_widget_item_title, item.title)
    views.setTextViewText(
      R.id.nori_widget_item_domain,
      Uri.parse(item.url).host?.removePrefix("www.") ?: item.url,
    )

    val image = WidgetIcons.loadPreview(context, item, previewSize.first, previewSize.second)
    if (image != null) {
      views.setImageViewBitmap(R.id.nori_widget_item_image, image)
      views.setViewVisibility(R.id.nori_widget_item_image, View.VISIBLE)
      views.setViewVisibility(R.id.nori_widget_item_fallback, View.GONE)
    } else {
      // No cached preview yet: the favicon stands in, centred in the thumbnail slot.
      views.setViewVisibility(R.id.nori_widget_item_image, View.GONE)
      views.setViewVisibility(R.id.nori_widget_item_fallback, View.VISIBLE)
      val icon = if (showFavicon) WidgetIcons.cached(context, item) else null
      if (icon != null) {
        views.setImageViewBitmap(R.id.nori_widget_item_icon, icon)
      } else {
        views.setImageViewResource(R.id.nori_widget_item_icon, R.drawable.nori_widget_ic_link)
      }
    }

    views.setOnClickFillInIntent(R.id.nori_widget_item, Intent().setData(Uri.parse(item.url)))
    return views
  }

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewTypeCount() = 2

  override fun getItemId(position: Int) = position.toLong()

  override fun hasStableIds() = false
}
