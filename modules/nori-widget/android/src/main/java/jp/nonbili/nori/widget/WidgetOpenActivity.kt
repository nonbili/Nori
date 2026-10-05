package jp.nonbili.nori.widget

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.browser.customtabs.CustomTabsIntent

/** Invisible hop between a widget row and the browser. */
class WidgetOpenActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val url = intent?.data
    val scheme = url?.scheme?.lowercase()
    if (url != null && (scheme == "http" || scheme == "https")) {
      try {
        if (WidgetStore.read(this).openInSystemBrowser) {
          startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } else {
          // Same tab setup as NoriBrowserModule.openTab.
          val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .build()
          customTabsIntent.intent.data = url
          customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
          customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
          startActivity(customTabsIntent.intent)
        }
      } catch (_: Throwable) {
        // No browser installed: nothing useful to show from a widget tap.
      }
    }
    finish()
  }
}
