import { useRef, useState } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { PREVIEW_IMAGE_RATIO } from '@/components/bookmark/BookmarkPreviewContent'
import { NoriText } from '@/components/common/NoriText'
import { FullScreenModal } from '@/components/modal/BaseModal'
import { hasPlaceholderTitle } from '@/lib/bookmark-title'
import { previewSource, saveRenderedPreview, type PreviewSource } from '@/lib/bookmark-preview'
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

// The generic text cannot tell failures apart. Where it stays on screen (the web), the reason
// goes with it so a report can be acted on.
const withReason = (generic: string, error: unknown) => {
  const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return Platform.OS === 'web' && reason ? `${generic}\n${reason}` : generic
}

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
  // What the pick starts from is the bookmark's own source; a pick applies to this bookmark only.
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

  const selectedSource = picked ?? previewSource(page.previewSource, fallback)
  const source = selectedSource === 'none' ? 'screenshot' : selectedSource

  const pick = (value: PreviewSource) => {
    setPicked(value)
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
    try {
      const data = await view.current?.read()
      if (!data || current !== load.current || savingNow.current) return
      // Replaces the last page's image, so a page without one never leaves it selectable.
      setCoverUrl(data.imageUrl)
      setCoverLoading(Boolean(data.imageUrl))
    } catch (error) {
      if (current === load.current && !savingNow.current) setError(withReason(t('preview.refreshFailed'), error))
    } finally {
      if (current === load.current && !savingNow.current) setMetaRead(true)
    }
  }

  const saveFromPage = async () => {
    // Held here: closing the sheet unmounts the view before the capture is released.
    const handle = view.current
    if (!handle) return
    savingNow.current = true
    setSaving(true)
    setError('')
    let screenshotUri: string | undefined
    try {
      // Capture first: metadata must not delay the shot until a cookie banner appears.
      if (source === 'screenshot') screenshotUri = await handle.capture()
      const data = await handle.read().catch((error) => {
        // A shot already captured is usable without metadata. A cover still needs a successful read.
        if (source !== 'screenshot') throw error
        return { title: '', description: '', imageUrl: '' }
      })
      await saveRenderedPreview(page.url, source, {
        description: data.description,
        imageUrl: data.imageUrl,
        screenshotUri,
      })
      // The bookmark shows what was just captured, without changing the default for the others.
      if (page.fromEditor) {
        // The editor saves the pick, and a title for an empty field, with the rest of its edits.
        const editor = ui$.bookmarkEditor.peek()
        if (editor) {
          const title = !editor.title.trim() && data.title && !hasPlaceholderTitle(data.title, page.url) ? data.title : editor.title
          ui$.bookmarkEditor.set({
            ...editor,
            title,
            ...(previewSource(editor.previewSource, fallback) !== source ? { previewSource: source } : {}),
          })
        }
      } else {
        if (previewSource(page.previewSource, fallback) !== source) {
          bookmarks$.update(page.id, { previewSource: source })
        }
        applyRenderedTitle(page.url, data.title)
      }
      close()
    } catch (error) {
      savingNow.current = false
      setSaving(false)
      fail(withReason(t(source === 'screenshot' ? 'preview.screenshotFailed' : 'preview.refreshFailed'), error))
    } finally {
      // Saving copies the capture, so the temp file it came from is no longer needed.
      if (screenshotUri) handle.release?.(screenshotUri)
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
                  setError('')
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
                  fail(
                    message.includes('install Chrome')
                      ? t('preview.browserMissing')
                      : withReason(t('preview.screenshotFailed'), message),
                  )
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
        <View className="flex-row items-center gap-3">
          <View className="flex-1"><PreviewPageOptions onChanged={() => view.current?.reload()} /></View>
          <Pressable disabled={saving} accessibilityRole="button" onPress={() => view.current?.reload()} className="rounded-full bg-muted px-4 py-2 active:bg-muted-strong">
            <NoriText className="text-content">{t('preview.refresh')}</NoriText>
          </Pressable>
        </View>
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
