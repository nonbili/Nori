package jp.nonbili.nori.browser

import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoriBrowserModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoriBrowser")

    Function("openTab") { url: String ->
      val context = appContext.reactContext ?: return@Function
      val customTabsIntent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .setUrlBarHidingEnabled(true)
        .build()

      customTabsIntent.intent.data = Uri.parse(url)
      customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
      customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)

      context.startActivity(customTabsIntent.intent)
    }
  }
}
