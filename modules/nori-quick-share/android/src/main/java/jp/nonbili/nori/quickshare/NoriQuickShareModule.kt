package jp.nonbili.nori.quickshare

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val PREFS_NAME = "nori_quick_share"
private const val KEY_ENABLED = "quick_save_enabled"
private const val KEY_TARGET_LIST_ID = "quick_save_target_list_id"
private const val KEY_INBOX = "quick_share_inbox"
private const val KEY_APP_INBOX = "app_share_inbox"

class NoriQuickShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoriQuickShare")

    AsyncFunction("configure") { enabled: Boolean, targetListId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_ENABLED, enabled)
        .putString(KEY_TARGET_LIST_ID, targetListId)
        .apply()
    }

    AsyncFunction("getPendingLinks") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      QuickShareJson.decodeInbox(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_INBOX, "[]") ?: "[]")
    }

    AsyncFunction("removePendingLinkIds") { ids: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val removeIds = ids.toSet()
      val next = QuickShareJson.decodeInbox(prefs.getString(KEY_INBOX, "[]") ?: "[]")
        .filter { !removeIds.contains(it["id"]) }
      prefs.edit().putString(KEY_INBOX, QuickShareJson.encodeInbox(next)).apply()
    }

    AsyncFunction("getPendingAppLinks") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      QuickShareJson.decodeInbox(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_APP_INBOX, "[]") ?: "[]")
    }

    AsyncFunction("removePendingAppLinkIds") { ids: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val removeIds = ids.toSet()
      val next = QuickShareJson.decodeInbox(prefs.getString(KEY_APP_INBOX, "[]") ?: "[]")
        .filter { !removeIds.contains(it["id"]) }
      prefs.edit().putString(KEY_APP_INBOX, QuickShareJson.encodeInbox(next)).apply()
    }
  }
}
