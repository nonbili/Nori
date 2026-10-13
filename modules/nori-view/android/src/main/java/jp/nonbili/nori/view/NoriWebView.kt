package jp.nonbili.nori.view

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.ByteArrayInputStream

/**
 * A WebView that exposes `window.ReactNativeWebView.postMessage`, as react-native-webview does,
 * and answers requests to blocklisted hosts with an empty response.
 */
@SuppressLint("SetJavaScriptEnabled")
class NoriWebView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoadStart by EventDispatcher()
  private val onLoadEnd by EventDispatcher()
  private val onError by EventDispatcher()
  private val onHttpError by EventDispatcher()
  private val onMessage by EventDispatcher()

  override val shouldUseAndroidLayout = true

  internal var pendingUrl: String? = null
  private var loadedUrl: String? = null
  internal var injectedJavaScript: String? = null

  private inner class Bridge {
    @JavascriptInterface
    fun postMessage(data: String) {
      post { onMessage(mapOf("data" to data)) }
    }
  }

  private val webView =
    WebView(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      addJavascriptInterface(Bridge(), "ReactNativeWebView")
      webViewClient =
        object : WebViewClient() {
          override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (!request.isForMainFrame && NoriBlocklist.shouldBlock(request.url.host)) {
              return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
            return null
          }

          override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            onLoadStart(mapOf("url" to url))
          }

          override fun onPageFinished(view: WebView, url: String) {
            injectedJavaScript?.let { view.evaluateJavascript(it, null) }
            onLoadEnd(mapOf("url" to url))
          }

          override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
            if (request.isForMainFrame) {
              onError(mapOf("description" to error.description.toString()))
            }
          }

          override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
            if (request.isForMainFrame) {
              onHttpError(mapOf("statusCode" to errorResponse.statusCode))
            }
          }
        }
    }

  init {
    addView(webView)
  }

  fun setUserAgent(userAgent: String?) {
    // Null puts the engine's own user agent back.
    webView.settings.userAgentString = userAgent?.ifEmpty { null }
  }

  /** Called once every prop of an update has landed, so the user agent is always set before the load. */
  fun loadPending() {
    val url = pendingUrl
    if (url != null && url != loadedUrl) {
      loadedUrl = url
      webView.loadUrl(url)
    }
  }

  fun evaluate(script: String) {
    webView.evaluateJavascript(script, null)
  }

  fun reload() {
    webView.reload()
  }

  fun destroyWebView() {
    webView.stopLoading()
    removeView(webView)
    webView.destroy()
  }
}
