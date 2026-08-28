import { useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { ScrollView, TextInput, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import { BaseCenterModal } from '@/components/modal/BaseCenterModal'
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getMeta } from '@/lib/bookmark'
import { getAllTags, getVisibleLists } from '@/lib/nori-data'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { showToast } from '@/lib/toast'
import { parseHttpUrl } from '@/lib/url'

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const BookmarkEditorSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const colorScheme = useAppColorScheme()
  const isDark = colorScheme === 'dark'
  const lists = useValue(lists$.lists)
  const editor = useValue(ui$.bookmarkEditor)
  const visibleLists = getVisibleLists(lists)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const bookmarks = useValue(bookmarks$.bookmarks)
  const editorTags = editor?.tags ?? []
  const tagSuggestions = getAllTags(bookmarks).filter((tag) => {
    const query = tagInput.trim().toLowerCase()
    if (editorTags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return false
    }
    return query ? tag.toLowerCase().includes(query) : true
  }).slice(0, 8)

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
    if (/[,\s]/.test(value)) {
      const parts = value.split(/[,\s]+/)
      const remainder = parts.pop() ?? ''
      parts.forEach(addTag)
      setTagInput(remainder)
    } else {
      setTagInput(value)
    }
  }

  const commitTagInput = () => {
    addTag(tagInput)
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    if (!editor) {
      return
    }
    ui$.bookmarkEditor.set({ ...editor, tags: editor.tags.filter((item) => item !== tag) })
  }

  const listScrollRef = useRef<ScrollView>(null)
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

  if (!editor) {
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

    if (!title) {
      setMetadataLoading(true)
      const meta = await getMeta(url.toString())
      setMetadataLoading(false)
      title = meta.title || getHostLabel(url.toString())
      icon = meta.icon || ''
    }

    const payload = {
      listId: editor.listId,
      url: url.toString(),
      title,
      icon,
      tags: editor.tags,
    }

    if (editor.id) {
      bookmarks$.update(editor.id, payload)
      showToast(t('bookmarks.updated'))
    } else {
      bookmarks$.add(payload)
      showToast(t('bookmarks.saved'))
    }

    settings$.setLastSelectedListId(payload.listId)
    ui$.bookmarkEditor.set(null)
  }

  const onClose = () => ui$.bookmarkEditor.set(null)

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-6 gap-4">
        <NoriText className="text-xl font-semibold text-stone-900 dark:text-stone-50">
          {editor.id ? t('bookmarks.edit') : t('bookmarks.add')}
        </NoriText>
        <View className="gap-3">
          <TextInput
            autoFocus={!editor.id}
            value={editor.url}
            onChangeText={(value) => ui$.bookmarkEditor.set({ ...editor, url: value })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={t('bookmarks.url')}
            placeholderTextColor={themeColors.placeholder}
            className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50"
          />
          <TextInput
            value={editor.title}
            onChangeText={(value) => ui$.bookmarkEditor.set({ ...editor, title: value })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('bookmarks.titleOptional')}
            placeholderTextColor={themeColors.placeholder}
            className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50"
          />
        </View>
        <View className="gap-2">
          {editor.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {editor.tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => removeTag(tag)}
                  className="h-[32px] flex-row items-center gap-1 rounded-full bg-stone-200 px-3 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
                >
                  <NoriText className="text-sm font-medium text-stone-700 dark:text-stone-300">{tag}</NoriText>
                  <MaterialIcons name="close" size={14} color={themeColors.iconMuted} />
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            value={tagInput}
            onChangeText={onChangeTagInput}
            onSubmitEditing={commitTagInput}
            blurOnSubmit={false}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('bookmarks.addTag')}
            placeholderTextColor={themeColors.placeholder}
            className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50"
          />
          {tagSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" keyboardShouldPersistTaps="handled">
              {tagSuggestions.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => {
                    addTag(tag)
                    setTagInput('')
                  }}
                  className="h-[28px] items-center justify-center rounded-full border border-stone-200 px-3 active:bg-stone-100 dark:border-stone-800 dark:active:bg-stone-800"
                >
                  <NoriText className="text-sm text-stone-500 dark:text-stone-400">{tag}</NoriText>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
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
                className="h-[32px] items-center justify-center rounded-full px-4"
                onLayout={(event) => {
                  listItemXRef.current[list.id] = event.nativeEvent.layout.x
                }}
                style={{
                  backgroundColor: isActive ? (isDark ? '#f5f5f4' : '#1c1917') : 'transparent',
                  borderWidth: isActive ? 0 : 1,
                  borderColor: isDark ? '#292524' : '#e7e5e4',
                }}
              >
                <NoriText
                  className="text-sm font-medium"
                  style={{ color: isActive ? (isDark ? '#0c0a09' : '#fafaf9') : (isDark ? '#a8a29e' : '#57534e') }}
                >
                  {list.name}
                </NoriText>
              </Pressable>
            )
          })}
        </ScrollView>
        <View className="flex-row justify-end gap-3">
          <Pressable onPress={onClose} className="rounded-full px-5 py-3 bg-stone-200 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700">
            <NoriText className="text-stone-900 dark:text-stone-100">{t('bookmarks.cancel')}</NoriText>
          </Pressable>
          <Pressable onPress={() => void saveBookmark()} className="rounded-full px-5 py-3 bg-emerald-500 active:bg-emerald-600">
            <NoriText className="font-medium text-white">{metadataLoading ? t('bookmarks.saving') : t('bookmarks.save')}</NoriText>
          </Pressable>
        </View>
      </View>
    </BaseCenterModal>
  )
}
