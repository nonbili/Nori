import ExpoModulesCore
import WebKit

/// Gives pages `window.ReactNativeWebView.postMessage`, as react-native-webview does.
private let bridgeScript = """
window.ReactNativeWebView = {
  postMessage: function (data) {
    window.webkit.messageHandlers.ReactNativeWebView.postMessage(String(data));
  }
};
"""

class NoriWebView: ExpoView, WKNavigationDelegate, WKScriptMessageHandler {
  let onLoadStart = EventDispatcher()
  let onLoadEnd = EventDispatcher()
  let onError = EventDispatcher()
  let onHttpError = EventDispatcher()
  let onMessage = EventDispatcher()

  var pendingUrl: String?
  var injectedJavaScript: String?
  private var loadedUrl: String?
  private var appliedRuleList: WKContentRuleList?
  private let webView: WKWebView

  required init(appContext: AppContext? = nil) {
    let configuration = WKWebViewConfiguration()
    let controller = WKUserContentController()
    controller.addUserScript(
      WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    )
    configuration.userContentController = controller
    webView = WKWebView(frame: .zero, configuration: configuration)
    super.init(appContext: appContext)

    // Held weakly by a proxy so the web view's controller does not keep this view alive.
    controller.add(WeakScriptMessageHandler(self), name: "ReactNativeWebView")
    webView.navigationDelegate = self
    webView.isOpaque = false
    webView.clipsToBounds = true
    addSubview(webView)
    NoriBlocklist.shared.register(self)
  }

  deinit {
    NoriBlocklist.shared.unregister(self)
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "ReactNativeWebView")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView.frame = bounds
  }

  func setUserAgent(_ userAgent: String?) {
    // Nil puts the engine's own user agent back.
    webView.customUserAgent = (userAgent?.isEmpty ?? true) ? nil : userAgent
  }

  func applyBlocklist(_ ruleList: WKContentRuleList?) {
    let controller = webView.configuration.userContentController
    if let current = appliedRuleList {
      controller.remove(current)
    }
    appliedRuleList = ruleList
    if let ruleList = ruleList {
      controller.add(ruleList)
    }
  }

  /// Called once every prop of an update has landed, so the user agent is always set before the load.
  func loadPending() {
    guard let url = pendingUrl, url != loadedUrl, let target = URL(string: url) else {
      return
    }
    loadedUrl = url
    webView.load(URLRequest(url: target))
  }

  func evaluate(_ script: String) {
    webView.evaluateJavaScript(script, completionHandler: nil)
  }

  func reload() {
    webView.reload()
  }

  // MARK: WKNavigationDelegate

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    onLoadStart(["url": webView.url?.absoluteString ?? ""])
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if let script = injectedJavaScript {
      webView.evaluateJavaScript(script, completionHandler: nil)
    }
    onLoadEnd(["url": webView.url?.absoluteString ?? ""])
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    onError(["description": error.localizedDescription])
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    onError(["description": error.localizedDescription])
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    if navigationResponse.isForMainFrame,
      let response = navigationResponse.response as? HTTPURLResponse,
      response.statusCode >= 400
    {
      onHttpError(["statusCode": response.statusCode])
    }
    decisionHandler(.allow)
  }

  // MARK: WKScriptMessageHandler

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let data = message.body as? String else {
      return
    }
    onMessage(["data": data])
  }
}

private class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
  private weak var target: WKScriptMessageHandler?

  init(_ target: WKScriptMessageHandler) {
    self.target = target
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(userContentController, didReceive: message)
  }
}
