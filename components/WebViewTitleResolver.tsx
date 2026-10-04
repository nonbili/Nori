import { isBlankPreviewCapture } from '@/lib/preview-capture-validation'
import { captureRef, releaseCapture } from 'react-native-view-shot'
import { setPreviewCapture } from '@/lib/bookmark-preview'
import { resolveTitleWithWebView } from '@/lib/webview-title-resolver'
import { useValue } from '@legendapp/state/react'
import { useEffect, useRef } from 'react'
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import {
  completeActiveJob,
  INJECTED_TITLE_SCRIPT,
  webViewResolver$,
  setWebViewTitleResolverAvailable,
  type WebViewTitleResult,
} from '@/lib/webview-title-resolver'

// Hard cap per job so a hanging page (consent wall, infinite spinner) can't stall
// the queue forever.
const JOB_TIMEOUT_MS = 9000
const SCREENSHOT_TIMEOUT_MS = 30000

/**
 * Invisible WebView mounted once at the app root. It processes one queued title
 * job at a time, loading the URL so its JavaScript runs, then reports the title
 * extracted by INJECTED_TITLE_SCRIPT back through completeActiveJob.
 */
export const WebViewTitleResolver: React.FC<{ canvasColor?: string }> = ({ canvasColor = '#fff' }) => {
  const { width } = useWindowDimensions()
  const captureView = useRef<View>(null)
  const active = useValue(webViewResolver$.active)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeId = active?.id

  useEffect(() => {
    setPreviewCapture(async (url) => {
      const result = await resolveTitleWithWebView(url, true)
      if (!result?.screenshotUri) throw new Error('preview_capture_failed')
      return result.screenshotUri
    })
    setWebViewTitleResolverAvailable(AppState.currentState === 'active')
    const subscription = AppState.addEventListener('change', (state) => {
      setWebViewTitleResolverAvailable(state === 'active')
    })
    return () => {
      setPreviewCapture(undefined)
      subscription.remove()
      setWebViewTitleResolverAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (activeId == null) {
      return
    }

    timeoutRef.current = setTimeout(
      () => {
        completeActiveJob(activeId, null)
      },
      webViewResolver$.active.peek()?.screenshot ? SCREENSHOT_TIMEOUT_MS : JOB_TIMEOUT_MS,
    )

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [activeId])

  if (active == null) {
    return null
  }

  const finish = (result: WebViewTitleResult | null) => {
    if (webViewResolver$.active.peek()?.id !== active.id) return
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    completeActiveJob(active.id, result)
  }

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as Partial<WebViewTitleResult>
      const title = (data.title || '').trim()
      if (active.screenshot) {
        if (Platform.OS === 'android') {
          // Keep the original size: Android's RAW buffer/header can retain the
          // original dimensions even when a smaller bitmap is requested.
          const pixels = await captureRef(captureView, { format: 'raw', result: 'base64' })
          if (webViewResolver$.active.peek()?.id !== active.id) return
          if (isBlankPreviewCapture(pixels)) throw new Error('preview_blank_capture')
        }
        const capturedPath = await captureRef(captureView, { format: 'jpg', quality: 0.8, result: 'tmpfile' })
        const screenshotUri = capturedPath.startsWith('/') ? `file://${capturedPath}` : capturedPath
        if (webViewResolver$.active.peek()?.id !== active.id) {
          releaseCapture(capturedPath)
          return
        }
        finish({ title, icon: data.icon || '', screenshotUri })
      } else {
        finish(title ? { title, icon: data.icon || '' } : null)
      }
    } catch {
      finish(null)
    }
  }

  const captureWidth = active.screenshot ? Math.min(400, width) : 1
  const captureHeight = active.screenshot ? 300 : 1

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        position: 'absolute',
        width: captureWidth,
        height: captureHeight,
        left: active.screenshot ? 0 : -10000,
        top: active.screenshot ? 0 : -10000,
        zIndex: -1,
      }}
    >
      <View
        ref={captureView}
        collapsable={false}
        pointerEvents="none"
        // Keep screenshots inside the viewport so Android paints the WebView.
        // The opaque sibling mask and app content conceal it from the user.
        style={{ width: captureWidth, height: captureHeight, backgroundColor: '#fff' }}
      >
        <WebView
          // Remount per job so each URL starts from a clean page/probe state.
          key={active.id}
          source={{ uri: active.url }}
          injectedJavaScript={INJECTED_TITLE_SCRIPT}
          onMessage={onMessage}
          onError={() => finish(null)}
          onHttpError={() => finish(null)}
          javaScriptEnabled
          domStorageEnabled
          // Many SPAs gate content behind a desktop UA; mirror the fetch path.
          userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          style={{ width: captureWidth, height: captureHeight }}
        />
      </View>
      {active.screenshot ? <View style={[StyleSheet.absoluteFill, { backgroundColor: canvasColor }]} /> : null}
    </View>
  )
}
