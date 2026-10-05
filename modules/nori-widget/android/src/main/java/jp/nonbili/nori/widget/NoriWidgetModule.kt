package jp.nonbili.nori.widget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoriWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoriWidget")

    AsyncFunction("setData") { json: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      WidgetStore.write(context, json)
      BookmarkWidgetProvider.updateAll(context)
    }
  }
}
