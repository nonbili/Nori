package jp.nonbili.nori.view

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoriViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoriView")

    AsyncFunction("setBlocklist") { blocklist: BlocklistRecord ->
      NoriBlocklist.set(blocklist)
    }

    View(NoriWebView::class) {
      Events("onLoadStart", "onLoadEnd", "onError", "onHttpError", "onMessage")

      Prop("source") { view: NoriWebView, url: String? ->
        view.pendingUrl = url
      }

      Prop("userAgent") { view: NoriWebView, userAgent: String? ->
        view.setUserAgent(userAgent)
      }

      Prop("injectedJavaScript") { view: NoriWebView, script: String? ->
        view.injectedJavaScript = script
      }

      OnViewDidUpdateProps { view: NoriWebView ->
        view.loadPending()
      }

      OnViewDestroys { view: NoriWebView ->
        view.destroyWebView()
      }

      AsyncFunction("injectJavaScript") { view: NoriWebView, script: String ->
        view.evaluate(script)
      }

      AsyncFunction("reload") { view: NoriWebView ->
        view.reload()
      }
    }
  }
}
