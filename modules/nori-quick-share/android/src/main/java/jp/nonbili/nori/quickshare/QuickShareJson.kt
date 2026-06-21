package jp.nonbili.nori.quickshare

import org.json.JSONArray
import org.json.JSONObject

object QuickShareJson {
  fun decodeInbox(value: String): List<Map<String, String>> {
    val result = mutableListOf<Map<String, String>>()
    val array = try {
      JSONArray(value)
    } catch (_: Throwable) {
      JSONArray()
    }

    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val id = item.optString("id")
      val url = item.optString("url")
      val targetListId = item.optString("targetListId")
      val createdAt = item.optString("createdAt")
      if (id.isNotBlank() && url.isNotBlank()) {
        result.add(mapOf(
          "id" to id,
          "url" to url,
          "targetListId" to targetListId,
          "createdAt" to createdAt,
        ))
      }
    }

    return result
  }

  fun encodeInbox(items: List<Map<String, String>>): String {
    val array = JSONArray()
    items.forEach { item ->
      array.put(JSONObject().apply {
        put("id", item["id"] ?: "")
        put("url", item["url"] ?: "")
        put("targetListId", item["targetListId"] ?: "")
        put("createdAt", item["createdAt"] ?: "")
      })
    }
    return array.toString()
  }
}

