package jp.nonbili.nori.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.AbsListView
import android.widget.ArrayAdapter
import android.widget.ListView

/** Picks which list a widget shows. Opened by the launcher or from the widget header. */
class WidgetConfigActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    setResult(RESULT_CANCELED, result)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    val snapshot = WidgetStore.read(this)
    val manager = AppWidgetManager.getInstance(this)
    if (snapshot.lists.isEmpty()) {
      // Nothing to choose yet: keep the widget, which shows its "open Nori" hint.
      BookmarkWidgetProvider.updateWidget(this, manager, widgetId, snapshot)
      setResult(RESULT_OK, result)
      finish()
      return
    }

    title = snapshot.chooseList ?: getString(R.string.nori_widget_choose_list)
    val listView = ListView(this)
    listView.choiceMode = AbsListView.CHOICE_MODE_SINGLE
    listView.adapter = ArrayAdapter(
      this,
      android.R.layout.simple_list_item_single_choice,
      snapshot.lists.map { it.name },
    )
    val current = WidgetStore.resolveList(this, snapshot, widgetId)
    listView.setItemChecked(snapshot.lists.indexOfFirst { it.id == current?.id }, true)
    listView.setOnItemClickListener { _, _, position, _ ->
      WidgetStore.setListId(this, widgetId, snapshot.lists[position].id)
      // One UI 8.5 discards a widget whose configuration ends before it has a complete
      // RemoteViews, so push the full layout before reporting success.
      BookmarkWidgetProvider.updateWidget(this, manager, widgetId, snapshot)
      setResult(RESULT_OK, result)
      finish()
    }
    setContentView(listView)
  }
}
