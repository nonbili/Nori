import ExpoModulesCore

public class NoriViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoriView")

    AsyncFunction("setBlocklist") { (blocklist: BlocklistRecord, promise: Promise) in
      NoriBlocklist.shared.set(blocklist) {
        promise.resolve(nil)
      }
    }

    View(NoriWebView.self) {
      Events("onLoadStart", "onLoadEnd", "onError", "onHttpError", "onMessage")

      Prop("source") { (view: NoriWebView, url: String?) in
        view.pendingUrl = url
      }

      Prop("userAgent") { (view: NoriWebView, userAgent: String?) in
        view.setUserAgent(userAgent)
      }

      Prop("injectedJavaScript") { (view: NoriWebView, script: String?) in
        view.injectedJavaScript = script
      }

      OnViewDidUpdateProps { (view: NoriWebView) in
        view.loadPending()
      }

      AsyncFunction("injectJavaScript") { (view: NoriWebView, script: String) in
        view.evaluate(script)
      }

      AsyncFunction("reload") { (view: NoriWebView) in
        view.reload()
      }
    }
  }
}
