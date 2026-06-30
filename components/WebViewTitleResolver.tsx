import { useValue } from '@legendapp/state/react'
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import {
  completeActiveJob,
  INJECTED_TITLE_SCRIPT,
  webViewResolver$,
  type WebViewTitleResult,
} from '@/lib/webview-title-resolver'

// Hard cap per job so a hanging page (consent wall, infinite spinner) can't stall
// the queue forever.
const JOB_TIMEOUT_MS = 9000

/**
 * Invisible WebView mounted once at the app root. It processes one queued title
 * job at a time, loading the URL so its JavaScript runs, then reports the title
 * extracted by INJECTED_TITLE_SCRIPT back through completeActiveJob.
 */
export const WebViewTitleResolver: React.FC = () => {
  const active = useValue(webViewResolver$.active)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeId = active?.id

  useEffect(() => {
    if (activeId == null) {
      return
    }

    timeoutRef.current = setTimeout(() => {
      completeActiveJob(activeId, null)
    }, JOB_TIMEOUT_MS)

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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    completeActiveJob(active.id, result)
  }

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as Partial<WebViewTitleResult>
      const title = (data.title || '').trim()
      finish(title ? { title, icon: data.icon || '' } : null)
    } catch {
      finish(null)
    }
  }

  return (
    <View
      pointerEvents="none"
      // Parked offscreen with a 1x1 footprint: some platforms won't load a WebView
      // that has no layout size, so we keep it tiny rather than zero-sized.
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: -10000, top: -10000 }}
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
        style={{ width: 1, height: 1 }}
      />
    </View>
  )
}
