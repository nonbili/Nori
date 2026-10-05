package jp.nonbili.nori.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews

class BookmarkWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val snapshot = WidgetStore.read(context)
    appWidgetIds.forEach { updateWidget(context, appWidgetManager, it, snapshot) }
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    WidgetStore.clear(context, appWidgetIds)
  }

  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val ids = manager.getAppWidgetIds(ComponentName(context, BookmarkWidgetProvider::class.java))
      if (ids.isEmpty()) {
        return
      }
      val snapshot = WidgetStore.read(context)
      ids.forEach { updateWidget(context, manager, it, snapshot) }
    }

    fun updateWidget(
      context: Context,
      manager: AppWidgetManager,
      widgetId: Int,
      snapshot: WidgetSnapshot = WidgetStore.read(context),
    ) {
      val views = RemoteViews(context.packageName, R.layout.nori_widget)
      val list = WidgetStore.resolveList(context, snapshot, widgetId)

      views.setTextViewText(
        R.id.nori_widget_title,
        list?.name?.ifBlank { null } ?: context.getString(R.string.nori_widget_label),
      )
      views.setTextViewText(R.id.nori_widget_empty, snapshot.empty ?: context.getString(R.string.nori_widget_empty))

      // The data uri keeps one adapter, and one set of PendingIntents, per widget.
      val widgetUri = Uri.parse("nori-widget://widget/$widgetId")
      val adapterIntent = Intent(context, BookmarkWidgetService::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        .setData(widgetUri)
      @Suppress("DEPRECATION")
      views.setRemoteAdapter(R.id.nori_widget_list, adapterIntent)
      views.setEmptyView(R.id.nori_widget_list, R.id.nori_widget_empty)

      // Tapping the header reopens the list picker, for launchers without a reconfigure entry.
      val configIntent = Intent(context, WidgetConfigActivity::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        .setData(widgetUri)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      views.setOnClickPendingIntent(
        R.id.nori_widget_header,
        PendingIntent.getActivity(
          context,
          widgetId,
          configIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )

      // Rows fill in the url. Android 14 rejects a mutable PendingIntent around an implicit
      // intent, so the template targets our own trampoline rather than ACTION_VIEW.
      val openIntent = Intent(context, WidgetOpenActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      views.setPendingIntentTemplate(
        R.id.nori_widget_list,
        PendingIntent.getActivity(context, widgetId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT or mutable),
      )

      manager.updateAppWidget(widgetId, views)
      @Suppress("DEPRECATION")
      manager.notifyAppWidgetViewDataChanged(widgetId, R.id.nori_widget_list)
    }
  }
}
