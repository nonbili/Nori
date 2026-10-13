import { useRef, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { PREVIEW_IMAGE_RATIO } from '@/components/bookmark/BookmarkPreviewContent'
import { NoriText } from '@/components/common/NoriText'
import { FullScreenModal } from '@/components/modal/BaseModal'
import { previewSource, saveRenderedPreview, type PreviewSource } from '@/lib/bookmark-preview'
import { previewSourceOverride } from '@/lib/bookmark-preview-types'
import type { PreviewPageViewHandle } from '@/lib/preview-page'
import { applyRenderedTitle } from '@/lib/title-backfill'
import { showToast } from '@/lib/toast'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { PreviewPageOptions, PreviewPageView } from './PreviewPageView'

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
 * captcha, dismiss a cookie banner, scroll to the part worth showing), then saves the preview
 * from what is on screen. The page itself is PreviewPageView: a WebView in the app, a page
 * streamed from a headless browser on desktop.
 */
export const PreviewPageSheet: React.FC = () => {
  const { t } = useTranslation()
  const page = useValue(ui$.previewPage)
  const fallback = useValue(settings$.previewImageSource)
  const view = useRef<PreviewPageViewHandle>(null)
  const [saving, setSaving] = useState(false)
  // A toast is only logged on the web, so a failure there is spelled out above the button.
  const [error, setError] = useState('')
  // Room left once the button has its own. The cover image and the live page share the largest
  // tile-shaped size that fits both under their headings, so a short window never pushes the
  // button out of reach.
  const [area, setArea] = useState({ width: 0, height: 0 })
  const frameWidth = Math.max(
    0,
    Math.min(area.width - INDENT, ((area.height - 2 * (HEADING_HEIGHT + GAP) - GAP) / 2) * PREVIEW_IMAGE_RATIO),
  )
  const frameHeight = frameWidth / PREVIEW_IMAGE_RATIO
  // A load that ends while saving is not read for its cover: the save reads the page itself.
  const savingNow = useRef(false)
  // Counts page loads, so a cover read from the page before this one is dropped.
  const load = useRef(0)
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
    savingNow.current = false
    setSaving(false)
    setError('')
    setPicked(null)
    setCoverUrl('')
    setMetaRead(false)
    setPageLoading(true)
    setCoverLoading(false)
    ui$.previewPage.set(null)
  }

  const fail = (message: string) => {
    if (Platform.OS === 'web') setError(message)
    else showToast(message)
  }

  // Once a page has loaded: note its cover image, so it can be picked beside the live page.
  const readCover = async () => {
    const current = load.current
    const data = await view.current?.read().catch(() => null)
    if (!data || current !== load.current || savingNow.current) return
    // Replaces the last page's image, so a page without one never leaves it selectable.
    setCoverUrl(data.imageUrl)
    setCoverLoading(Boolean(data.imageUrl))
    setMetaRead(true)
  }

  const saveFromPage = async () => {
    if (!view.current) return
    savingNow.current = true
    setSaving(true)
    setError('')
    try {
      const data = await view.current.read()
      let screenshotUri: string | undefined
      // A site that publishes no cover image still gets one: what is on screen.
      if (source === 'screenshot' || !data.imageUrl) {
        screenshotUri = await view.current.capture()
      }
      await saveRenderedPreview(page.url, source, {
        description: data.description,
        imageUrl: data.imageUrl,
        screenshotUri,
      })
      // A bookmark with its own source keeps showing it, not the one just captured.
      if (previewSourceOverride(page.previewSource) && previewSourceOverride(page.previewSource) !== source) {
        bookmarks$.update(page.id, { previewSource: source })
      }
      applyRenderedTitle(page.url, data.title)
      close()
    } catch {
      savingNow.current = false
      setSaving(false)
      fail(t(source === 'screenshot' ? 'preview.screenshotFailed' : 'preview.refreshFailed'))
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
              <PreviewPageView
                ref={view}
                url={page.url}
                onLoadStart={() => {
                  load.current++
                  setPageLoading(true)
                  setMetaRead(false)
                  setCoverUrl('')
                  setCoverLoading(false)
                }}
                onLoadEnd={() => {
                  setPageLoading(false)
                  if (!savingNow.current) void readCover()
                }}
                onError={(message) => {
                  setMetaRead(true)
                  fail(t(message.includes('install Chrome') ? 'preview.browserMissing' : 'preview.screenshotFailed'))
                }}
              />
              {pageLoading ? (
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                  <ActivityIndicator size="large" />
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <PreviewPageOptions onChanged={() => view.current?.reload()} />
        {error ? <NoriText className="text-sm text-content-muted">{error}</NoriText> : null}
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
