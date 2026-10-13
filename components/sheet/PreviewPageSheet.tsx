import { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { captureRef } from 'react-native-view-shot'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { PREVIEW_IMAGE_RATIO } from '@/components/bookmark/BookmarkPreviewContent'
import { NoriText } from '@/components/common/NoriText'
import { FullScreenModal } from '@/components/modal/BaseModal'
import { previewSource, saveRenderedPreview } from '@/lib/bookmark-preview'
import { applyRenderedTitle } from '@/lib/title-backfill'
import { showToast } from '@/lib/toast'
import { READ_PAGE_META_SCRIPT, type WebViewTitleResult } from '@/lib/webview-title-resolver'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'

/**
 * Shows a bookmark's page so the user can get it into shape themselves (solve a
 * captcha, dismiss a cookie banner), then saves the preview from what is on screen.
 */
export const PreviewPageSheet: React.FC = () => {
  const { t } = useTranslation()
  const page = useValue(ui$.previewPage)
  const fallback = useValue(settings$.previewImageSource)
  const webView = useRef<WebView>(null)
  const captureView = useRef<View>(null)
  const [saving, setSaving] = useState(false)
  // Room left for the frame once the button has its own; the frame is the largest tile-shaped
  // rectangle that fits, so a short landscape window never pushes the button out of reach.
  const [area, setArea] = useState({ width: 0, height: 0 })
  const frameWidth = Math.min(area.width, area.height * PREVIEW_IMAGE_RATIO)
  // The page can post on its own; only the read asked for below is saved.
  const reading = useRef(false)

  if (!page) {
    return null
  }

  const source = previewSource(page.previewSource, fallback)

  const close = () => {
    reading.current = false
    setSaving(false)
    ui$.previewPage.set(null)
  }

  const saveFromPage = () => {
    reading.current = true
    setSaving(true)
    webView.current?.injectJavaScript(READ_PAGE_META_SCRIPT)
  }

  const onMessage = async (event: WebViewMessageEvent) => {
    if (!reading.current) return
    reading.current = false
    try {
      const data = JSON.parse(event.nativeEvent.data) as Partial<WebViewTitleResult>
      const imageUrl = /^https?:\/\//i.test(data.imageUrl || '') ? data.imageUrl! : ''
      let screenshotUri: string | undefined
      // A site that publishes no cover image still gets one: what is on screen.
      if (source === 'screenshot' || !imageUrl) {
        const path = await captureRef(captureView, { format: 'jpg', quality: 0.8, result: 'tmpfile' })
        screenshotUri = path.startsWith('/') ? `file://${path}` : path
      }
      await saveRenderedPreview(page.url, source, {
        description: (data.description || '').trim().slice(0, 2000),
        imageUrl,
        screenshotUri,
      })
      applyRenderedTitle(page.url, (data.title || '').trim())
      close()
    } catch {
      setSaving(false)
      showToast(t(source === 'screenshot' ? 'preview.screenshotFailed' : 'preview.refreshFailed'))
    }
  }

  return (
    <FullScreenModal visible title={t('preview.capturePreview')} onClose={close}>
      <View className="flex-1 gap-4">
        <View
          className="min-h-0 flex-1 items-center justify-center"
          onLayout={({ nativeEvent: { layout } }) => setArea({ width: layout.width, height: layout.height })}
        >
          {/* The frame has the tile image's shape, so the screenshot is what the tile shows. */}
          <View
            ref={captureView}
            collapsable={false}
            style={{ width: frameWidth, height: frameWidth / PREVIEW_IMAGE_RATIO }}
            className="overflow-hidden rounded-2xl bg-white"
          >
            {/* The WebView's own user agent, as for automatic previews: bot protection
              rejects one the engine doesn't match. */}
            <WebView
              ref={webView}
              source={{ uri: page.url }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              style={{ flex: 1 }}
            />
          </View>
        </View>
        <Pressable
          disabled={saving}
          onPress={saveFromPage}
          className="self-end rounded-full bg-accent-fill px-5 py-3 active:bg-accent-fill-pressed"
        >
          <NoriText className="font-medium text-accent-on">
            {t(saving ? 'preview.capturing' : 'preview.capture')}
          </NoriText>
        </Pressable>
      </View>
    </FullScreenModal>
  )
}
