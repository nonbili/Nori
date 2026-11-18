import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Platform, Pressable, Share, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { Image } from 'expo-image'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as MediaLibrary from 'expo-media-library/legacy'
import { Album } from 'expo-media-library'
import { captureRef } from 'react-native-view-shot'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { vars } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@/components/modal/BaseModal'
import { NoriText } from '@/components/common/NoriText'
import { Favicon } from '@/components/bookmark/Favicon'
import { SavedSocialPost, useSavedSocialPostState } from '@/components/bookmark/SavedSocialPost'
import { ImageLoadTrackerContext, type ImageLoadTracker } from '@/components/bookmark/imageLoadTracker'
import { loadBookmarkPreview, previewSource, shownPreview, type BookmarkPreview } from '@/lib/bookmark-preview'
import { previewKey } from '@/lib/bookmark-preview-types'
import { getImageRatio } from '@/lib/preview-layout'
import { hasPlaceholderTitle } from '@/lib/bookmark-title'
import { getNote, getTags } from '@/lib/nori-data'
import { ColorSchemeOverride, useAppColorScheme, useThemeColors } from '@/lib/theme'
import { accentVariables, normalizeAccent } from '@/lib/accent'
import { systemPalette$ } from '@/lib/system-palette'
import appIcon from '@/assets/images/icon.png'
import splashIcon from '@/assets/images/splash-icon.png'
import { showToast } from '@/lib/toast'
import { settings$ } from '@/states/settings'
import { ui$, type ShareImageState } from '@/states/ui'

// The card is laid out at a phone's width whatever the screen, so the image reads the same everywhere.
const CARD_WIDTH = 360
// A page image wider than this is letterboxed rather than shown as a thin strip.
const MIN_IMAGE_RATIO = 0.75
const MAX_IMAGE_RATIO = 2.4
// A slow image should not keep the Share button off for good: after this, the card goes as it is.
const IMAGE_WAIT_MS = 5000
// Android's share call returns once the chooser closes, while the app picked may still be reading
// the file through its content uri. The cache folder is the OS's to clear anyway, so this is generous.
const ANDROID_RELEASE_DELAY_MS = 60_000

const releaseFile = (uri: string) => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})

const noop = () => {}

// The gallery shows the file under its own name, so it gets one: Nori-20261118-124601.png.
const savedImageName = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `Nori-${date}-${time}.png`
}

type CardScheme = 'light' | 'dark'

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function PageCard({ bookmark, onReady }: { bookmark: ShareImageState; onReady: () => void }) {
  const fallback = useValue(settings$.previewImageSource)
  const source = previewSource(bookmark.json?.previewSource, fallback)
  const [preview, setPreview] = useState<BookmarkPreview | null | undefined>(() => shownPreview(bookmark.url, source) || undefined)
  let key = ''
  try {
    key = previewKey(bookmark.url, source)
  } catch {}
  const [ratio, setRatio] = useState(() => getImageRatio(key))

  useEffect(() => {
    if (source === 'none') {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    let active = true
    loadBookmarkPreview(bookmark.url, source, false, { signal: controller.signal }).then(
      (value) => { if (active) setPreview(value || null) },
      () => { if (active) setPreview((current) => current || null) },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [bookmark.url, source])

  const imageUri = source !== 'none' ? preview?.imageUri : ''
  const [drawnUri, setDrawnUri] = useState('')
  // Ready once the preview has settled with no image to wait for; with one, once it has drawn. An
  // effect rather than the image's callbacks, so a parent that is not ready to say so yet asks again.
  useEffect(() => {
    if (preview !== undefined && (!imageUri || drawnUri === imageUri)) onReady()
  }, [preview, imageUri, drawnUri, onReady])

  const description = preview?.description || (hasPlaceholderTitle(bookmark.title, bookmark.url) ? bookmark.url : '')
  const imageRatio = Math.min(MAX_IMAGE_RATIO, Math.max(MIN_IMAGE_RATIO, ratio || 1.91))

  return (
    <View>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', aspectRatio: imageRatio }}
          contentFit="cover"
          onLoad={({ source: loaded }) => {
            if (loaded.width > 0 && loaded.height > 0) setRatio(loaded.width / loaded.height)
            setDrawnUri(imageUri)
          }}
          onError={() => setDrawnUri(imageUri)}
        />
      ) : null}
      <View className="gap-2 p-4">
        <View className="flex-row items-center gap-2">
          <Favicon iconUrl={bookmark.icon} pageUrl={bookmark.url} slotSize={18} iconSize={16} />
          <NoriText className="flex-1 text-xs text-content-muted" numberOfLines={1}>{hostname(bookmark.url)}</NoriText>
        </View>
        <NoriText className="text-base font-semibold text-content" numberOfLines={3}>{bookmark.title}</NoriText>
        {description ? <NoriText className="text-sm text-content-muted" numberOfLines={4}>{description}</NoriText> : null}
      </View>
    </View>
  )
}

/** What gets captured: the bookmark as a card, with its note and tags, signed with Nori's mark. */
function ShareCard({ bookmark, onReady, includeNote, includeTags, scheme, still }: {
  bookmark: ShareImageState
  onReady: () => void
  includeNote: boolean
  includeTags: boolean
  // Set by ThemedCard; `dark:` classes would follow the app instead, so the card picks by this.
  scheme: CardScheme
  // While capturing: what is a button on screen is drawn as a label in the picture.
  still: boolean
}) {
  const themeColors = useThemeColors()
  const { saved: savedPost, settled } = useSavedSocialPostState(bookmark.url)
  // The post's images, counted from mount until each has drawn, so Share waits for all of them.
  const pending = useRef(new Set<object>()).current
  const [loadedCount, setLoadedCount] = useState(0)
  const tracker = useMemo<ImageLoadTracker>(() => ({
    start: (id) => { pending.add(id) },
    finish: (id) => { if (pending.delete(id)) setLoadedCount((count) => count + 1) },
  }), [pending])
  const note = includeNote ? getNote(bookmark) : ''
  const tags = includeTags ? getTags(bookmark) : []

  useEffect(() => {
    if (savedPost && pending.size === 0) onReady()
  }, [savedPost, loadedCount, pending, onReady])

  return (
    <View className="gap-3 bg-canvas p-5" style={{ width: CARD_WIDTH }}>
      <View className="overflow-hidden rounded-2xl bg-surface">
        {savedPost ? (
          <ImageLoadTrackerContext.Provider value={tracker}>
            <SavedSocialPost post={savedPost.post} still={still} />
          </ImageLoadTrackerContext.Provider>
        ) : (
          // Until the saved post has been read, the page card must not say the card is ready: the post may yet replace it.
          <PageCard bookmark={bookmark} onReady={settled ? onReady : noop} />
        )}
      </View>
      {note ? (
        <View className={`flex-row gap-2 rounded-2xl px-4 py-3 ${scheme === 'dark' ? 'bg-accent-950/40' : 'bg-accent-100'}`}>
          <MaterialIcons name="edit-note" size={18} color={themeColors.contentSecondary} />
          <NoriText className={`flex-1 text-sm ${scheme === 'dark' ? 'text-accent-100' : 'text-accent-900'}`}>{note}</NoriText>
        </View>
      ) : null}
      {tags.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <View key={tag} className="rounded-full bg-muted px-2.5 py-1">
              <NoriText className="text-xs text-content-muted">#{tag}</NoriText>
            </View>
          ))}
        </View>
      ) : null}
      <View className="items-end px-1">
        {scheme === 'dark' ? (
          // The splash's mark on the splash's ground; its glyph sits in more padding than the app icon's.
          <View className="items-center justify-center overflow-hidden" style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#0c0a09' }}>
            <Image source={splashIcon} style={{ width: 36, height: 36 }} contentFit="contain" />
          </View>
        ) : (
          <Image source={appIcon} style={{ width: 28, height: 28, borderRadius: 7 }} contentFit="contain" />
        )}
      </View>
    </View>
  )
}

/** Draws its children in the given scheme, tokens and theme hooks alike, whatever the app is in. */
function ThemedCard({ scheme, children }: { scheme: CardScheme; children: React.ReactNode }) {
  const accent = useValue(settings$.accent)
  // The System accent reads the wallpaper palette.
  const palette = useValue(systemPalette$)
  const style = useMemo(
    () => vars(accentVariables(normalizeAccent(accent), scheme, false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, scheme, palette],
  )
  return (
    <ColorSchemeOverride.Provider value={scheme}>
      <View style={style}>{children}</View>
    </ColorSchemeOverride.Provider>
  )
}

function SchemeSwatch({ scheme, label, selected, onPress }: {
  scheme: CardScheme
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full border-2 ${selected ? 'border-accent-500' : 'border-transparent'}`}
    >
      <View
        className="h-7 w-7 rounded-full border border-line-strong"
        style={{ backgroundColor: scheme === 'dark' ? '#111' : '#fff' }}
      />
    </Pressable>
  )
}

function OptionChip({ icon, label, selected, onPress }: {
  icon: 'edit-note' | 'sell'
  label: string
  selected: boolean
  onPress: () => void
}) {
  const themeColors = useThemeColors()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${selected ? 'border-accent-500 bg-accent-100 dark:bg-accent-950/40' : 'border-line-strong'}`}
    >
      <MaterialIcons name={selected ? 'check' : icon} size={16} color={selected ? themeColors.accent : themeColors.contentMuted} />
      <NoriText className={`text-sm ${selected ? 'text-accent-900 dark:text-accent-100' : 'text-content-secondary'}`}>{label}</NoriText>
    </Pressable>
  )
}

export function ShareImageSheet() {
  const { t } = useTranslation()
  const bookmark = useValue(ui$.shareImage)
  const themeColors = useThemeColors()
  const cardRef = useRef<ComponentRef<typeof View>>(null)
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const scrollOffset = useSharedValue(0)
  const [ready, setReady] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const appScheme = useAppColorScheme()
  const [scheme, setScheme] = useState<CardScheme>(appScheme)
  // A note is often written for oneself, so it goes in only when asked for; tags are less personal.
  const [includeNote, setIncludeNote] = useState(false)
  const [includeTags, setIncludeTags] = useState(true)
  // Stable, so the card's effects do not run again on every render.
  const markReady = useRef(() => setReady(true)).current

  useEffect(() => {
    setReady(false)
    setIncludeNote(false)
    setIncludeTags(true)
    setScheme(appScheme)
    scrollOffset.value = 0
    if (!bookmark) return
    const timer = setTimeout(markReady, IMAGE_WAIT_MS)
    return () => clearTimeout(timer)
    // Only a new bookmark resets the picks, not the app changing scheme under an open sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmark, markReady, scrollOffset])

  const close = () => ui$.shareImage.set(null)
  const hasNote = bookmark ? Boolean(getNote(bookmark)) : false
  const hasTags = bookmark ? getTags(bookmark).length > 0 : false

  // Draws the card still, captures it, and puts the live card back.
  const capture = async <R extends 'tmpfile' | 'base64'>(result: R) => {
    setCapturing(true)
    try {
      // Two frames, so the still card has been drawn before it is captured.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return await captureRef(cardRef, { format: 'png', result })
    } finally {
      setCapturing(false)
    }
  }

  const save = async () => {
    if (!bookmark || sharing) return
    setSharing(true)
    let uri = ''
    try {
      // Write-only: nothing here reads the library, and on Android 13+ this asks for nothing.
      const { granted } = await MediaLibrary.requestPermissionsAsync(true)
      if (!granted) throw new Error('permission_denied')
      const path = await capture('tmpfile')
      const captured = path.startsWith('/') ? `file://${path}` : path
      uri = `${FileSystem.cacheDirectory}${savedImageName()}`
      await FileSystem.moveAsync({ from: captured, to: uri })
      // Android puts a plain save loose in DCIM/; an album keeps them together in Pictures/Nori/.
      // iOS has no such folder to find: a plain save lands in Recents.
      if (Platform.OS === 'android') await Album.create('Nori', [uri])
      else await MediaLibrary.saveToLibraryAsync(uri)
      showToast(t('bookmarks.imageSaved'))
    } catch {
      showToast(t('bookmarks.saveImageFailed'))
    } finally {
      setSharing(false)
      // The library keeps its own copy.
      if (uri) releaseFile(uri)
    }
  }

  const share = async () => {
    if (!bookmark || sharing) return
    setSharing(true)
    let uri = ''
    try {
      const path = await capture('tmpfile')
      uri = path.startsWith('/') ? `file://${path}` : path
      if (Platform.OS === 'ios') {
        // iOS shares the link with the picture, so the page is a tap away for whoever gets it.
        await Share.share({ url: uri, message: bookmark.url })
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('share_unavailable')
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: bookmark.title })
      }
    } catch {
      showToast(t('bookmarks.shareImageFailed'))
    } finally {
      setSharing(false)
      if (uri) {
        const captured = uri
        if (Platform.OS === 'ios') releaseFile(captured)
        else setTimeout(() => releaseFile(captured), ANDROID_RELEASE_DELAY_MS)
      }
    }
  }

  return (
    <Sheet visible={!!bookmark} title={t('bookmarks.shareImage')} height="85%" onClose={close} contentScrollRef={scrollRef} contentScrollOffset={scrollOffset}>
      {bookmark ? (
        <View className="flex-1 gap-4">
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="items-center pb-4"
            showsVerticalScrollIndicator={false}
            onScroll={(event) => { scrollOffset.value = event.nativeEvent.contentOffset.y }}
            scrollEventThrottle={16}
          >
            <View className="overflow-hidden rounded-2xl border border-line">
              <ThemedCard scheme={scheme}>
                <View ref={cardRef} collapsable={false}>
                  <ShareCard bookmark={bookmark} onReady={markReady} includeNote={includeNote} includeTags={includeTags} scheme={scheme} still={capturing} />
                </View>
              </ThemedCard>
            </View>
          </ScrollView>
          <View className="flex-row flex-wrap items-center gap-2">
            <View accessibilityRole="radiogroup" className="flex-row gap-1">
              <SchemeSwatch scheme="light" label={t('settings.experience.light')} selected={scheme === 'light'} onPress={() => setScheme('light')} />
              <SchemeSwatch scheme="dark" label={t('settings.experience.dark')} selected={scheme === 'dark'} onPress={() => setScheme('dark')} />
            </View>
            {hasNote || hasTags ? <View className="mx-1 h-6 w-px bg-line" /> : null}
            {hasNote ? <OptionChip icon="edit-note" label={t('bookmarks.shareImageNote')} selected={includeNote} onPress={() => setIncludeNote(!includeNote)} /> : null}
            {hasTags ? <OptionChip icon="sell" label={t('bookmarks.tags')} selected={includeTags} onPress={() => setIncludeTags(!includeTags)} /> : null}
          </View>
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('bookmarks.saveImage')}
              disabled={!ready || sharing}
              onPress={() => void save()}
              className="items-center justify-center rounded-2xl border border-line-strong px-4 py-3"
              style={{ opacity: ready && !sharing ? 1 : 0.6 }}
            >
              <MaterialIcons name="file-download" size={20} color={themeColors.content} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!ready || sharing}
              onPress={() => void share()}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-accent-fill px-4 py-3"
              style={{ opacity: ready && !sharing ? 1 : 0.6 }}
            >
              {ready && !sharing
                ? <MaterialIcons name="share" size={18} color={themeColors.onAccent} />
                : <ActivityIndicator size="small" color={themeColors.onAccent} />}
              <NoriText className="text-sm font-medium text-accent-on">{t('bookmarks.share')}</NoriText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
