package jp.nonbili.nori.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.AbsListView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.RadioButton
import android.widget.RadioGroup

/** Picks which list a widget shows and how its rows look. Opened by the launcher or from the widget header. */
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
    val padding = (16 * resources.displayMetrics.density).toInt()

    val listView = ListView(this)
    listView.choiceMode = AbsListView.CHOICE_MODE_SINGLE
    listView.adapter = ArrayAdapter(
      this,
      android.R.layout.simple_list_item_single_choice,
      snapshot.lists.map { it.name },
    )
    val current = WidgetStore.resolveList(this, snapshot, widgetId)
    listView.setItemChecked(snapshot.lists.indexOfFirst { it.id == current?.id }.coerceAtLeast(0), true)

    val compact = RadioButton(this).apply {
      id = R.id.nori_widget_view_compact
      text = snapshot.viewCompact ?: getString(R.string.nori_widget_view_compact)
    }
    val preview = RadioButton(this).apply {
      id = R.id.nori_widget_view_preview
      text = snapshot.viewPreview ?: getString(R.string.nori_widget_view_preview)
    }
    val viewGroup = RadioGroup(this).apply {
      orientation = RadioGroup.HORIZONTAL
      setPadding(padding, padding / 2, padding, 0)
      addView(compact)
      addView(preview, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { marginStart = padding })
      check(if (WidgetStore.isPreview(this@WidgetConfigActivity, widgetId)) preview.id else compact.id)
    }

    val done = Button(this).apply {
      setText(android.R.string.ok)
      setOnClickListener {
        val position = listView.checkedItemPosition.coerceIn(0, snapshot.lists.lastIndex)
        WidgetStore.setListId(this@WidgetConfigActivity, widgetId, snapshot.lists[position].id)
        WidgetStore.setPreview(this@WidgetConfigActivity, widgetId, viewGroup.checkedRadioButtonId == preview.id)
        // One UI 8.5 discards a widget whose configuration ends before it has a complete
        // RemoteViews, so push the full layout before reporting success.
        BookmarkWidgetProvider.updateWidget(this@WidgetConfigActivity, manager, widgetId, snapshot)
        setResult(RESULT_OK, result)
        finish()
      }
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(listView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
      addView(viewGroup)
      addView(done, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { setMargins(padding, padding / 2, padding, padding / 2) })
    }
    setContentView(root)
  }
}
