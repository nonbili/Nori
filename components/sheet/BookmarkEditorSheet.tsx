import { previewSourceOverride } from '@/lib/bookmark-preview-types'
import { retainEditorPreview } from '@/lib/bookmark-preview'
import { useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { Keyboard, Platform, ScrollView, Pressable, TextInput, View, useWindowDimensions } from 'react-native'
import { NoriText, NoriTextInput } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import { BaseCenterModal } from '@/components/modal/BaseCenterModal'
import { useThemeColors } from '@/lib/theme'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { canLoadPagesForTitles } from '@/lib/rendered-titles'
import { ui$ } from '@/states/ui'
import { getMeta } from '@/lib/bookmark'
import { getTagsByUse, getVisibleLists, normalizeTags } from '@/lib/nori-data'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { showToast } from '@/lib/toast'
import { parseHttpUrl } from '@/lib/url'
import { Choice } from '@/components/bookmark/PreviewSettings'
import { BookmarkPreviewContent } from '@/components/bookmark/BookmarkPreviewContent'
import { loadBookmarkPreview, previewSource } from '@/lib/bookmark-preview'
import { enrichSavedBookmark } from '@/lib/saved-bookmark-metadata'
import { previewPageDriver } from '@/lib/preview-page'
import { TagSuggestionMenu } from '@/components/sheet/TagSuggestionMenu'

// React Native Web's Modal closes on an Escape keyup it hears on the document. Stop the one that
// ends an Escape the tag menu already took before it gets there, so it does not close the editor too.
const swallowEscapeKeyUp = () => {
  const swallow = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    document.removeEventListener('keyup', swallow, true)
  }
  document.addEventListener('keyup', swallow, true)
}

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// The tag menu's height when there is room for it, and the least it opens below the input with.
const TAG_MENU_MAX_HEIGHT = 240
const TAG_MENU_GAP = 6
const TAG_MENU_MARGIN = 8

// Shared by every text field so they stay the same height.
const INPUT_CLASS = 'rounded-xl border border-line bg-surface px-4 py-3 text-content'

export const BookmarkEditorSheet: React.FC = () => {
  const { t } = useTranslation()
  const { height } = useWindowDimensions()
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  const themeColors = useThemeColors()
  const lists = useValue(lists$.lists)
  const editor = useValue(ui$.bookmarkEditor)
  // Hidden, though kept with its edits, while its page is open to capture a preview from: a modal
  // over this one is unreliable on Android and the web.
  const capturing = useValue(() => ui$.previewPage.get()?.fromEditor === true)
  const visibleLists = getVisibleLists(lists)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const defaultImageSource = useValue(settings$.previewImageSource)
  const previewMode = useValue(settings$.bookmarkView) === 'preview'
  useEffect(() => {
    if (editor?.url) return retainEditorPreview(editor.url)
  }, [editor?.url])
  useEffect(() => { setPreviewError('') }, [editor?.id, editor?.url])
  // The sheet stays mounted while closed, so a half-typed tag would carry into the next bookmark.
  const editorOpen = editor != null
  useEffect(() => { setTagInput('') }, [editor?.id, editorOpen])
  const bookmarks = useValue(bookmarks$.bookmarks)
  const editorTags = editor?.tags ?? []
  // Suggested in a menu that only opens with the input focused, so they never read as tags already
  // on the bookmark. An empty input lists the tags in use, most used first, to pick one without
  // recalling its name.
  const tagQuery = tagInput.trim().toLowerCase()
  const tagSuggestions = getTagsByUse(bookmarks).filter((tag) => {
    if (editorTags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return false
    }
    return tag.toLowerCase().includes(tagQuery)
  })
  const [tagInputFocused, setTagInputFocused] = useState(false)
  // Escape closes the menu until something is typed or the input is focused again.
  const [tagMenuDismissed, setTagMenuDismissed] = useState(false)
  // Nothing is highlighted while the input is empty, so an empty submit still leaves the input.
  const [highlightedTag, setHighlightedTag] = useState(-1)
  useEffect(() => { setHighlightedTag(tagQuery ? 0 : -1) }, [tagQuery])
  const showTagSuggestions = tagInputFocused && !tagMenuDismissed && tagSuggestions.length > 0
  // The tag input's place within the sheet content. Measured rather than summed from onLayout y values, which
  // react-native-web only reports on resize, so they go stale when the preview above loads and pushes the input down.
  const [tagInputFrame, setTagInputFrame] = useState({ top: 0, height: 0 })
  const sheetContentRef = useRef<React.ComponentRef<typeof View>>(null)
  const [sheetContentHeight, setSheetContentHeight] = useState(0)
  // The part of the sheet content in view, which the keyboard and scrolling both change.
  const [sheetScrollY, setSheetScrollY] = useState(0)
  const [sheetViewportHeight, setSheetViewportHeight] = useState(0)
  // The menu is laid out against the whole sheet content, as Android drops touches on a child drawn
  // outside its parent's bounds, and kept to the part of it in view. It opens below the input when
  // it fits there, else on whichever side has more room, and scrolls when it is cut short.
  const tagInputBottom = tagInputFrame.top + tagInputFrame.height
  const roomAboveTagInput = tagInputFrame.top - Math.max(0, sheetScrollY) - TAG_MENU_GAP - TAG_MENU_MARGIN
  const roomBelowTagInput = Math.min(sheetContentHeight, sheetScrollY + sheetViewportHeight) - tagInputBottom - TAG_MENU_GAP - TAG_MENU_MARGIN
  const tagMenuBelow = roomBelowTagInput >= TAG_MENU_MAX_HEIGHT || roomBelowTagInput >= roomAboveTagInput
  const tagMenuMaxHeight = Math.min(TAG_MENU_MAX_HEIGHT, Math.max(0, tagMenuBelow ? roomBelowTagInput : roomAboveTagInput))
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current) }, [])

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (!editor || !tag) {
      return
    }
    if (editor.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return
    }
    ui$.bookmarkEditor.set({ ...editor, tags: [...editor.tags, tag] })
  }

  // Commit tokens as they are separated by comma or whitespace; keep any trailing partial.
  const onChangeTagInput = (value: string) => {
    setTagMenuDismissed(false)
    if (/[,\s]/.test(value)) {
      const parts = value.split(/[,\s]+/)
      const remainder = parts.pop() ?? ''
      parts.forEach(addTag)
      setTagInput(remainder)
    } else {
      setTagInput(value)
    }
  }

  const tagInputRef = useRef<React.ComponentRef<typeof TextInput>>(null)
  const measureTagInput = () => {
    if (sheetContentRef.current) {
      tagInputRef.current?.measureLayout(sheetContentRef.current, (_x, top, _width, height) => setTagInputFrame({ top, height }))
    }
  }
  const commitTagInput = () => {
    // The input stays focused after a submit so several tags can go in a row; an empty submit
    // is the way out of it.
    if (!tagInput.trim() && !(showTagSuggestions && tagSuggestions[highlightedTag])) {
      tagInputRef.current?.blur()
      return
    }
    addTag(showTagSuggestions ? tagSuggestions[highlightedTag] ?? tagInput : tagInput)
    setTagInput('')
    // The input may already have been empty, which leaves the query as it was.
    setHighlightedTag(-1)
  }

  const pickTagSuggestion = (tag: string) => {
    addTag(tag)
    setTagInput('')
    setHighlightedTag(-1)
  }

  const onTagInputKeyPress = (key: string, preventDefault: () => void) => {
    if (!showTagSuggestions) return
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      preventDefault()
      const step = key === 'ArrowDown' ? 1 : -1
      setHighlightedTag((index) => index < 0
        ? (step > 0 ? 0 : tagSuggestions.length - 1)
        : (index + step + tagSuggestions.length) % tagSuggestions.length)
    } else if (key === 'Escape') {
      if (Platform.OS === 'web') swallowEscapeKeyUp()
      setTagInput('')
      setTagMenuDismissed(true)
    }
  }

  const removeTag = (tag: string) => {
    if (!editor) {
      return
    }
    ui$.bookmarkEditor.set({ ...editor, tags: editor.tags.filter((item) => item !== tag) })
  }

  const listScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null)
  const listItemXRef = useRef<Record<string, number>>({})
  const didInitialScrollRef = useRef(false)
  const activeEditorKeyRef = useRef('')

  const scrollToActiveList = (animated: boolean) => {
    if (!editor?.listId) {
      return
    }
    const x = listItemXRef.current[editor.listId]
    if (typeof x !== 'number') {
      return
    }
    listScrollRef.current?.scrollTo({ x: Math.max(x - 24, 0), animated })
  }

  const activeEditorKey = editor ? `${editor.id || 'new'}:${editor.listId}` : ''
  if (activeEditorKeyRef.current !== activeEditorKey) {
    activeEditorKeyRef.current = activeEditorKey
    didInitialScrollRef.current = false
  }

  if (!editor || capturing) {
    return null
  }

  const saveBookmark = async () => {
    let url: URL
    try {
      url = parseHttpUrl(editor.url)
    } catch {
      showToast(t('bookmarks.invalidUrl'))
      return
    }

    let title = editor.title.trim()
    let icon = editor.icon.trim()
    const resolveAfterSaving = !title && canLoadPagesForTitles() && settings$.loadPagesForTitles.peek()

    if (!title && !resolveAfterSaving) {
      setMetadataLoading(true)
      const meta = await getMeta(url.toString())
      setMetadataLoading(false)
      title = meta.title || getHostLabel(url.toString())
      icon = meta.icon || ''
    }
    title ||= getHostLabel(url.toString())

    const payload = {
      listId: editor.listId,
      url: url.toString(),
      title,
      icon,
      ...(editor.previewSource ? { previewSource: previewSourceOverride(editor.previewSource) ?? ('default' as const) } : {}),
      // Keep a tag still sitting in the input, which only becomes a chip on submit or a separator.
      tags: normalizeTags([...editor.tags, tagInput]),
      note: editor.note,
    }

    let savedId: string | null = editor.id || null
    if (editor.id) {
      bookmarks$.update(editor.id, payload)
      showToast(t('bookmarks.updated'))
    } else {
      savedId = bookmarks$.add(payload)
      showToast(t('bookmarks.saved'))
    }

    settings$.setLastSelectedListId(payload.listId)
    ui$.bookmarkEditor.set(null)
    if (resolveAfterSaving && savedId) void enrichSavedBookmark(savedId)
  }

  const refreshPreview = async () => {
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const url = parseHttpUrl(editor.url).href
      await loadBookmarkPreview(url, previewSource(editor.previewSource, defaultImageSource), true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('preview_open_bookmarked_page')) setPreviewError(t('preview.openPage'))
      else if (message.includes('install Chrome')) setPreviewError(t('preview.browserMissing'))
      else {
        // The generic text cannot tell failures apart; keep the reason so a report can be acted on.
        const generic = t(previewSource(editor.previewSource, defaultImageSource) === 'screenshot' ? 'preview.screenshotFailed' : 'preview.refreshFailed')
        setPreviewError(message ? `${generic}\n${message}` : generic)
      }
    } finally { setPreviewLoading(false) }
  }

  // The page in view, to dismiss a banner or get past a captcha that the refresh above captures as is.
  const canCapturePage = Platform.OS !== 'web' || previewPageDriver() != null
  const capturePage = () => {
    let url: string
    try {
      url = parseHttpUrl(editor.url).href
    } catch {
      setPreviewError(t('bookmarks.invalidUrl'))
      return
    }
    setPreviewError('')
    ui$.previewPage.set({ id: editor.id ?? '', url, previewSource: editor.previewSource, fromEditor: true })
  }

  const onClose = () => ui$.bookmarkEditor.set(null)

  return (
    <BaseCenterModal onClose={onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: Math.max(220, height - keyboardHeight - 120) }}
        onLayout={(event) => setSheetViewportHeight(event.nativeEvent.layout.height)}
        onScroll={(event) => setSheetScrollY(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
      <View
        ref={sheetContentRef}
        className="gap-5 p-6"
        onLayout={(event) => {
          setSheetContentHeight(event.nativeEvent.layout.height)
          measureTagInput()
        }}
      >
        <NoriText className="text-xl font-semibold text-content">
          {editor.id ? t('bookmarks.edit') : t('bookmarks.add')}
        </NoriText>
        <View className="gap-3">
          <NoriTextInput
            autoFocus={!editor.id}
            value={editor.url}
            onChangeText={(value) => ui$.bookmarkEditor.set({ ...editor, url: value })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={t('bookmarks.url')}
            placeholderTextColor={themeColors.contentSubtle}
            className={INPUT_CLASS}
          />
          <NoriTextInput
            value={editor.title}
            onChangeText={(value) => ui$.bookmarkEditor.set({ ...editor, title: value })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('bookmarks.titleOptional')}
            placeholderTextColor={themeColors.contentSubtle}
            className={INPUT_CLASS}
          />
        </View>
        {previewMode ? <View className="gap-3">
          <NoriText className="text-xs font-medium uppercase tracking-[0.12em] text-content-subtle">{t('preview.imageSource')}</NoriText>
          <View className="flex-row flex-wrap gap-2">
            {(['default', 'page-image', 'screenshot'] as const).map((source) => <Choice
              key={source}
              label={t(`preview.${source}`)}
              active={(editor.previewSource ?? 'default') === source}
              tinted
              onPress={() => { setPreviewError(''); ui$.bookmarkEditor.set({ ...editor, previewSource: source }) }}
            />)}
          </View>
          {/^https?:\/\//i.test(editor.url) ? <View className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1 flex-row overflow-hidden rounded-2xl bg-surface">
              <BookmarkPreviewContent cachedOnly bookmark={{ ...editor, json: { previewSource: editor.previewSource } }} />
            </View>
            {/* Beside the image and clear of the text fields, which a stylus tap near them opens instead. */}
            <Pressable
              disabled={previewLoading}
              accessibilityRole="button"
              accessibilityLabel={t('preview.refresh')}
              hitSlop={6}
              onPress={() => void refreshPreview()}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-muted-strong"
              style={{ opacity: previewLoading ? 0.5 : 1 }}
            >
              <MaterialIcons name="refresh" size={22} color={themeColors.content} />
            </Pressable>
            {canCapturePage ? <Pressable
              disabled={previewLoading}
              accessibilityRole="button"
              accessibilityLabel={t('preview.capturePreview')}
              hitSlop={6}
              onPress={capturePage}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-muted-strong"
              style={{ opacity: previewLoading ? 0.5 : 1 }}
            >
              <MaterialIcons name="web" size={22} color={themeColors.content} />
            </Pressable> : null}
          </View> : null}
          {previewError ? <NoriText accessibilityRole="alert" className="text-xs text-content-muted">{previewError}</NoriText> : null}
        </View> : null}
        <View className="gap-2">
          {editor.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {editor.tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => removeTag(tag)}
                  className="min-h-[32px] py-1.5 flex-row items-center gap-1 rounded-full bg-muted px-3 active:bg-muted-strong"
                >
                  <NoriText className="text-sm font-medium text-content-secondary">{tag}</NoriText>
                  <MaterialIcons name="close" size={14} color={themeColors.contentMuted} />
                </Pressable>
              ))}
            </View>
          )}
          <NoriTextInput
            ref={tagInputRef}
            value={tagInput}
            onLayout={measureTagInput}
            onChangeText={onChangeTagInput}
            onSubmitEditing={commitTagInput}
            onKeyPress={(event) => onTagInputKeyPress(event.nativeEvent.key, () => event.preventDefault())}
            onFocus={() => {
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
              measureTagInput()
              setTagMenuDismissed(false)
              setTagInputFocused(true)
            }}
            // A tap can blur the input before the menu row sees it, so hide a moment later. (The mouse no longer does.)
            onBlur={() => { blurTimerRef.current = setTimeout(() => setTagInputFocused(false), 150) }}
            blurOnSubmit={false}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('bookmarks.addTag')}
            placeholderTextColor={themeColors.contentSubtle}
            className={INPUT_CLASS}
          />
        </View>
        <NoriTextInput
          value={editor.note}
          onChangeText={(value) => ui$.bookmarkEditor.set({ ...editor, note: value })}
          multiline
          textAlignVertical="top"
          placeholder={t('bookmarks.addNote')}
          placeholderTextColor={themeColors.contentSubtle}
          className={`min-h-[88px] ${INPUT_CLASS}`}
        />
        <ScrollView
          ref={listScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3"
          onContentSizeChange={() => {
            if (didInitialScrollRef.current) {
              return
            }
            requestAnimationFrame(() => {
              scrollToActiveList(false)
              didInitialScrollRef.current = true
            })
          }}
        >
          {visibleLists.map((list) => {
            const isActive = list.id === editor.listId
            return (
              <Pressable
                key={list.id}
                onPress={() => ui$.bookmarkEditor.set({ ...editor, listId: list.id })}
                className={`min-h-[32px] items-center justify-center rounded-full border px-4 py-1.5 ${
                  isActive ? 'border-accent-500 bg-accent-100/70 dark:bg-accent-950/30' : 'border-line bg-surface'
                }`}
                onLayout={(event) => {
                  listItemXRef.current[list.id] = event.nativeEvent.layout.x
                }}
              >
                <NoriText
                  className="text-sm font-medium"
                  style={{ color: isActive ? themeColors.accent : themeColors.contentMuted }}
                >
                  {list.name}
                </NoriText>
              </Pressable>
            )
          })}
        </ScrollView>
        <View className="flex-row justify-end gap-3">
          <Pressable onPress={onClose} className="rounded-full px-5 py-3 bg-muted active:bg-muted-strong">
            <NoriText className="text-content">{t('bookmarks.cancel')}</NoriText>
          </Pressable>
          <Pressable disabled={metadataLoading || previewLoading} onPress={() => void saveBookmark()} className="rounded-full px-5 py-3 bg-accent-fill active:bg-accent-fill-pressed">
            <NoriText className="font-medium text-accent-on">{metadataLoading ? t('bookmarks.saving') : t('bookmarks.save')}</NoriText>
          </Pressable>
        </View>
        {showTagSuggestions && sheetContentHeight > 0 && tagMenuMaxHeight > 0 ? (
          <TagSuggestionMenu
            suggestions={tagSuggestions}
            query={tagQuery}
            highlighted={highlightedTag}
            onPick={pickTagSuggestion}
            maxHeight={tagMenuMaxHeight}
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              ...(tagMenuBelow
                ? { top: tagInputBottom + TAG_MENU_GAP }
                : { bottom: sheetContentHeight - tagInputFrame.top + TAG_MENU_GAP }),
            }}
          />
        ) : null}
      </View>
      </ScrollView>
    </BaseCenterModal>
  )
}
