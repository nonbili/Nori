import { useRef, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { captureRef } from 'react-native-view-shot'
import { applyBlocklist, supportsRuntimeBlocklist } from '@/lib/blocklist'
import { getUserAgent } from '@/lib/useragent'
import { NoriWebView, type NoriWebViewHandle, type NoriWebViewMessageEvent } from '@/modules/nori-view'
import { blocklist$ } from '@/states/blocklist'
import { PREVIEW_IMAGE_RATIO } from '@/components/bookmark/BookmarkPreviewContent'
import { NoriText } from '@/components/common/NoriText'
import { FullScreenModal } from '@/components/modal/BaseModal'
import { previewSource, saveRenderedPreview, type PreviewSource } from '@/lib/bookmark-preview'
import { previewSourceOverride } from '@/lib/bookmark-preview-types'
import { applyRenderedTitle } from '@/lib/title-backfill'
import { showToast } from '@/lib/toast'
import { READ_PAGE_META_SCRIPT, type WebViewTitleResult } from '@/lib/webview-title-resolver'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'

const HEADING_HEIGHT = 32
const GAP = 12
// Content sits under the radio's label rather than under the radio itself.
const INDENT = 32

const ringClass = (selected: boolean) => (selected ? 'border-accent-500' : 'border-muted-strong')

const Radio: React.FC<{
  label: string
  hint?: string
  loading?: boolean
  selected: boolean
  disabled?: boolean
  onPress: () => void
}> = ({ label, hint, loading, selected, disabled, onPress }) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled }}
    className="flex-row items-center gap-3"
    style={{ height: HEADING_HEIGHT, opacity: disabled ? 0.5 : 1 }}
  >
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className={selected ? 'border-accent-500' : 'border-content-subtle'}
    >
      {selected ? <View style={{ width: 10, height: 10, borderRadius: 5 }} className="bg-accent-500" /> : null}
    </View>
    <NoriText className="font-medium text-content">{label}</NoriText>
    {loading ? <ActivityIndicator size="small" /> : null}
    {hint ? (
      <NoriText className="flex-1 text-sm text-content-muted" numberOfLines={1}>
        {hint}
      </NoriText>
    ) : null}
  </Pressable>
)

/**
 * Shows a bookmark's page so the user can get it into shape themselves (solve a
 * captcha, dismiss a cookie banner), then saves the preview from what is on screen.
 */
export const PreviewPageSheet: React.FC = () => {
  const { t } = useTranslation()
  const page = useValue(ui$.previewPage)
  const fallback = useValue(settings$.previewImageSource)
  const webView = useRef<NoriWebViewHandle>(null)
  const blockAds = useValue(blocklist$.enabled)
  const captureView = useRef<View>(null)
  const [saving, setSaving] = useState(false)
  // Room left once the button has its own. The cover image and the live page share the largest
  // tile-shaped size that fits both under their headings, so a short window never pushes the
  // button out of reach.
  const [area, setArea] = useState({ width: 0, height: 0 })
  const frameWidth = Math.max(
    0,
    Math.min(area.width - INDENT, ((area.height - 2 * (HEADING_HEIGHT + GAP) - GAP) / 2) * PREVIEW_IMAGE_RATIO),
  )
  const frameHeight = frameWidth / PREVIEW_IMAGE_RATIO
  // The page can post on its own; only the read asked for below is saved.
  const reading = useRef(false)
  // What the pick starts from is the bookmark's own source; picking one also makes it the default.
  const [picked, setPicked] = useState<PreviewSource | null>(null)
  // The page's own cover image, read once it has loaded, so it can be shown beside the live page.
  const [coverUrl, setCoverUrl] = useState('')
  // The page has been read once it loaded, with or without a cover image to show for it.
  const [metaRead, setMetaRead] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [coverLoading, setCoverLoading] = useState(false)

  if (!page) {
    return null
  }

  const source = picked ?? previewSource(page.previewSource, fallback)

  const pick = (value: PreviewSource) => {
    setPicked(value)
    settings$.previewImageSource.set(value)
  }

  const close = () => {
    reading.current = false
    setSaving(false)
    setPicked(null)
    setCoverUrl('')
    setMetaRead(false)
    setPageLoading(true)
    setCoverLoading(false)
    ui$.previewPage.set(null)
  }

  // The switch is global, so it is also what the automatic previews use. The page is loaded again
  // once the list has landed, since a list only affects the loads that start after it.
  const toggleBlockAds = async () => {
    blocklist$.setEnabled(!blockAds)
    await applyBlocklist()
    webView.current?.reload()
  }

  const saveFromPage = () => {
    reading.current = true
    setSaving(true)
    webView.current?.injectJavaScript(READ_PAGE_META_SCRIPT)
  }

  const onMessage = async (event: NoriWebViewMessageEvent) => {
    let data: Partial<WebViewTitleResult>
    try {
      data = JSON.parse(event.nativeEvent.data) as Partial<WebViewTitleResult>
    } catch {
      return
    }
    // A page that finished loading without being asked to save: only note its cover image.
    if (!reading.current) {
      // Replaces the last page's image, so a page without one never leaves it selectable.
      const cover = /^https?:\/\//i.test(data.imageUrl || '') ? data.imageUrl! : ''
      setCoverUrl(cover)
      setCoverLoading(Boolean(cover))
      setMetaRead(true)
      return
    }
    reading.current = false
    try {
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
      // A bookmark with its own source keeps showing it, not the one just captured.
      if (previewSourceOverride(page.previewSource) && previewSourceOverride(page.previewSource) !== source) {
        bookmarks$.update(page.id, { previewSource: source })
      }
      applyRenderedTitle(page.url, (data.title || '').trim())
      close()
    } catch {
      setSaving(false)
      showToast(t(source === 'screenshot' ? 'preview.screenshotFailed' : 'preview.refreshFailed'))
    }
  }

  return (
    <FullScreenModal visible title={t('preview.capturePreview')} onClose={close}>
      <View className="flex-1 gap-3">
        <View
          className="min-h-0 flex-1"
          style={{ gap: GAP }}
          onLayout={({ nativeEvent: { layout } }) => setArea({ width: layout.width, height: layout.height })}
        >
          <View style={{ gap: GAP }}>
            <Radio
              label={t('preview.page-image')}
              hint={coverUrl || !metaRead ? undefined : t('preview.coverNone')}
              loading={!metaRead}
              selected={source === 'page-image'}
              disabled={!coverUrl}
              onPress={() => pick('page-image')}
            />
            <Pressable
              disabled={!coverUrl}
              onPress={() => pick('page-image')}
              accessibilityRole="radio"
              accessibilityState={{ selected: source === 'page-image' }}
              className={`overflow-hidden rounded-2xl border-2 bg-muted ${ringClass(source === 'page-image')}`}
              style={{ marginLeft: INDENT, width: frameWidth, height: frameHeight }}
            >
              {coverUrl ? (
                <Image
                  source={{ uri: coverUrl }}
                  contentFit="cover"
                  style={{ flex: 1 }}
                  onLoadEnd={() => setCoverLoading(false)}
                />
              ) : null}
              {!metaRead || coverLoading ? (
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                  <ActivityIndicator size="large" />
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={{ gap: GAP }}>
            <Radio
              label={t('preview.screenshot')}
              selected={source === 'screenshot'}
              onPress={() => pick('screenshot')}
            />
            {/* The frame has the tile image's shape, so the screenshot is what the tile shows. The ring
              is outside the captured view, so it never ends up in the saved image. */}
            <View
              className={`overflow-hidden rounded-2xl border-2 ${ringClass(source === 'screenshot')}`}
              style={{ marginLeft: INDENT, width: frameWidth, height: frameHeight }}
            >
              <View ref={captureView} collapsable={false} className="flex-1 bg-white">
                <NoriWebView
                  ref={webView}
                  source={page.url}
                  userAgent={getUserAgent(Platform.OS)}
                  onMessage={onMessage}
                  onLoadStart={() => {
                    setPageLoading(true)
                    setMetaRead(false)
                    setCoverUrl('')
                    setCoverLoading(false)
                  }}
                  onLoadEnd={() => {
                    setPageLoading(false)
                    if (!reading.current) webView.current?.injectJavaScript(READ_PAGE_META_SCRIPT)
                  }}
                  style={{ flex: 1 }}
                />
              </View>
              {pageLoading ? (
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                  <ActivityIndicator size="large" />
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {supportsRuntimeBlocklist() ? (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <NoriText className="font-medium text-content">{t('preview.blockAds')}</NoriText>
              <NoriText className="text-sm text-content-muted">{t('preview.blockAdsHint')}</NoriText>
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
        ) : null}
        <Pressable
          disabled={saving}
          onPress={saveFromPage}
          className="items-center rounded-full bg-accent-fill px-5 py-3 active:bg-accent-fill-pressed"
        >
          <NoriText className="font-medium text-accent-on">
            {t(saving ? 'preview.capturing' : 'preview.capture')}
          </NoriText>
        </Pressable>
      </View>
    </FullScreenModal>
  )
}
