import { requireNativeView } from 'expo'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export interface NoriWebViewHandle {
  injectJavaScript(script: string): void
  reload(): void
}

export interface NoriWebViewMessageEvent {
  nativeEvent: { data: string }
}

export interface NoriWebViewProps {
  /** The page to load. Changing it loads the new page. */
  source: string
  /** Leave unset for the engine's own user agent. */
  userAgent?: string
  /** Run in the page each time it finishes loading. */
  injectedJavaScript?: string
  style?: StyleProp<ViewStyle>
  onLoadStart?: () => void
  onLoadEnd?: () => void
  onError?: () => void
  onHttpError?: () => void
  /** Posted by the page through `window.ReactNativeWebView.postMessage`. */
  onMessage?: (event: NoriWebViewMessageEvent) => void
}

interface NativeProps extends Omit<NoriWebViewProps, 'onMessage'> {
  ref: React.Ref<any>
  onMessage?: (event: NoriWebViewMessageEvent) => void
}

const NativeView = requireNativeView<NativeProps>('NoriView') as React.ComponentType<any>

/** A WebView with the blocklist applied, standing in for react-native-webview's. */
export const NoriWebView = forwardRef<NoriWebViewHandle, NoriWebViewProps>(function NoriWebView(props, ref) {
  const native = useRef<any>(null)
  useImperativeHandle(ref, () => ({
    injectJavaScript: (script) => {
      native.current?.injectJavaScript(script)
    },
    reload: () => {
      native.current?.reload()
    },
  }))
  return <NativeView ref={native} {...props} />
})
