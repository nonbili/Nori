package jp.nonbili.nori.widget

import android.content.Context
import org.json.JSONObject
import java.io.File

data class WidgetItem(val title: String, val url: String, val icon: String)

data class WidgetList(val id: String, val name: String, val items: List<WidgetItem>)

data class WidgetSnapshot(
  val lists: List<WidgetList> = emptyList(),
  val openInSystemBrowser: Boolean = false,
  val showFavicon: Boolean = true,
  val chooseList: String? = null,
  val empty: String? = null,
)

private const val PREFS_NAME = "nori_widget"
private const val DATA_FILE = "nori-widget.json"

/** The snapshot the app pushes, plus which list each placed widget shows. */
object WidgetStore {
  private fun dataFile(context: Context) = File(context.filesDir, DATA_FILE)

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun write(context: Context, json: String) {
    // Write beside the target and rename, so a widget refresh never reads half a file.
    val temp = File(context.filesDir, "$DATA_FILE.tmp")
    temp.writeText(json)
    if (!temp.renameTo(dataFile(context))) {
      dataFile(context).writeText(json)
      temp.delete()
    }
  }

  fun read(context: Context): WidgetSnapshot {
    return try {
      val root = JSONObject(dataFile(context).readText())
      val lists = mutableListOf<WidgetList>()
      val listArray = root.optJSONArray("lists")
      for (listIndex in 0 until (listArray?.length() ?: 0)) {
        val list = listArray?.optJSONObject(listIndex) ?: continue
        val items = mutableListOf<WidgetItem>()
        val itemArray = list.optJSONArray("items")
        for (itemIndex in 0 until (itemArray?.length() ?: 0)) {
          val item = itemArray?.optJSONObject(itemIndex) ?: continue
          val url = item.optString("url")
          if (url.isNotBlank()) {
            items.add(WidgetItem(item.optString("title").ifBlank { url }, url, item.optString("icon")))
          }
        }
        val id = list.optString("id")
        if (id.isNotBlank()) {
          lists.add(WidgetList(id, list.optString("name"), items))
        }
      }
      val strings = root.optJSONObject("strings")
      WidgetSnapshot(
        lists = lists,
        openInSystemBrowser = root.optBoolean("openInSystemBrowser", false),
        showFavicon = root.optBoolean("showFavicon", true),
        chooseList = strings?.optString("chooseList")?.ifBlank { null },
        empty = strings?.optString("empty")?.ifBlank { null },
      )
    } catch (_: Throwable) {
      WidgetSnapshot()
    }
  }

  fun getListId(context: Context, widgetId: Int): String? = prefs(context).getString("list_$widgetId", null)

  fun setListId(context: Context, widgetId: Int, listId: String) {
    prefs(context).edit().putString("list_$widgetId", listId).apply()
  }

  fun clear(context: Context, widgetIds: IntArray) {
    val editor = prefs(context).edit()
    widgetIds.forEach { editor.remove("list_$it") }
    editor.apply()
  }

  /** Falls back to the first list, so an unconfigured widget still shows something. */
  fun resolveList(context: Context, snapshot: WidgetSnapshot, widgetId: Int): WidgetList? {
    val listId = getListId(context, widgetId)
    return snapshot.lists.find { it.id == listId } ?: snapshot.lists.firstOrNull()
  }
}
