package jp.nonbili.nori.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

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

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val snapshot = WidgetStore.read(context)
    items = WidgetStore.resolveList(context, snapshot, widgetId)?.items ?: emptyList()
    showFavicon = snapshot.showFavicon
  }

  override fun onDestroy() {
    items = emptyList()
  }

  override fun getCount() = items.size

  // Runs on a binder thread, so loading the favicon here does not block the launcher.
  override fun getViewAt(position: Int): RemoteViews? {
    val item = items.getOrNull(position) ?: return null
    val views = RemoteViews(context.packageName, R.layout.nori_widget_item)
    views.setTextViewText(R.id.nori_widget_item_title, item.title)

    if (showFavicon) {
      views.setViewVisibility(R.id.nori_widget_item_icon, View.VISIBLE)
      val icon = WidgetIcons.load(context, item)
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

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewTypeCount() = 1

  override fun getItemId(position: Int) = position.toLong()

  override fun hasStableIds() = false
}
