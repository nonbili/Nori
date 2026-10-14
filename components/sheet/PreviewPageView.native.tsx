import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import * as FileSystem from 'expo-file-system/legacy'
import { captureRef } from 'react-native-view-shot'
import { applyBlocklist, supportsRuntimeBlocklist } from '@/lib/blocklist'
import { getUserAgent } from '@/lib/useragent'
import { NoriWebView, type NoriWebViewHandle, type NoriWebViewMessageEvent } from '@/modules/nori-view'
import { blocklist$ } from '@/states/blocklist'
import { NoriText } from '@/components/common/NoriText'
import type { PreviewPageRead, PreviewPageViewHandle, PreviewPageViewProps } from '@/lib/preview-page'
import { READ_PAGE_META_SCRIPT, type WebViewTitleResult } from '@/lib/webview-title-resolver'

/** The bookmark's page in a WebView, which is also what gets captured. */
export const PreviewPageView = forwardRef<PreviewPageViewHandle, PreviewPageViewProps>(
  ({ url, onLoadStart, onLoadEnd }, ref) => {
    const webView = useRef<NoriWebViewHandle>(null)
    const captureView = useRef<View>(null)
    // The page can post on its own; a message only answers the reads asked for.
    const reads = useRef<((page: PreviewPageRead) => void)[]>([])

    useImperativeHandle(
      ref,
      () => ({
        reload: () => webView.current?.reload(),
        read: () =>
          new Promise<PreviewPageRead>((resolve) => {
            reads.current.push(resolve)
            webView.current?.injectJavaScript(READ_PAGE_META_SCRIPT)
          }),
        capture: async () => {
          const path = await captureRef(captureView, { format: 'jpg', quality: 0.8, result: 'tmpfile' })
          return path.startsWith('/') ? `file://${path}` : path
        },
        release: (uri) => {
          if (uri.startsWith('file://')) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
        },
      }),
      [],
    )

    const onMessage = (event: NoriWebViewMessageEvent) => {
      let data: Partial<WebViewTitleResult>
      try {
        data = JSON.parse(event.nativeEvent.data) as Partial<WebViewTitleResult>
      } catch {
        return
      }
      const waiting = reads.current
      reads.current = []
      const page = {
        title: (data.title || '').trim(),
        description: (data.description || '').trim().slice(0, 2000),
        imageUrl: /^https?:\/\//i.test(data.imageUrl || '') ? data.imageUrl! : '',
      }
      waiting.forEach((resolve) => resolve(page))
    }

    return (
      <View ref={captureView} collapsable={false} className="flex-1 bg-white">
        <NoriWebView
          ref={webView}
          source={url}
          userAgent={getUserAgent(Platform.OS)}
          onMessage={onMessage}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          style={{ flex: 1 }}
        />
      </View>
    )
  },
)

export const PreviewPageOptions: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { t } = useTranslation()
  const blockAds = useValue(blocklist$.enabled)
  if (!supportsRuntimeBlocklist()) {
    return null
  }

  // The switch is global, so it is also what the automatic previews use. The page is loaded again
  // once the list has landed, since a list only affects the loads that start after it.
  const toggleBlockAds = async () => {
    blocklist$.setEnabled(!blockAds)
    await applyBlocklist()
    onChanged()
  }

  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1">
        <NoriText className="font-medium text-content">{t('preview.blockAds')}</NoriText>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={t('preview.blockAds')}
        accessibilityState={{ checked: blockAds }}
        onPress={toggleBlockAds}
        className={`h-8 w-14 rounded-full p-1 ${blockAds ? 'bg-accent-500' : 'bg-muted-strong'}`}
      >
        <View className={`h-6 w-6 rounded-full bg-white ${blockAds ? 'ml-auto' : ''}`} />
      </Pressable>
    </View>
  )
}
