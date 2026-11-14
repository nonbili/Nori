import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import { NoriText, NoriTextInput } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import { BaseCenterModal } from '@/components/modal/BaseCenterModal'
import { useThemeColors } from '@/lib/theme'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { getBookmarkSortOrder, type BookmarkSortOrder } from '@/lib/nori-data'
import { NouMenu } from '@/components/menu/NouMenu'

export const ListEditorSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const editor = useValue(ui$.listEditor)
  const lists = useValue(lists$.lists)

  if (!editor) {
    return null
  }

  const sortOrder = editor.sortOrder ?? getBookmarkSortOrder(lists.find((list) => list.id === editor.id))
  const sortOptions: { order: BookmarkSortOrder; label: string }[] = [
    { order: 'manual', label: t('lists.manualOrder') },
    { order: 'newest', label: t('bookmarks.sorting.newestFirst') },
    { order: 'oldest', label: t('bookmarks.sorting.oldestFirst') },
    { order: 'az', label: t('bookmarks.sorting.nameAz') },
    { order: 'za', label: t('bookmarks.sorting.nameZa') },
  ]

  const saveList = () => {
    if (!editor.name.trim()) {
      showToast(t('lists.enterName'))
      return
    }

    if (editor.id) {
      lists$.renameList(editor.id, editor.name)
      lists$.setBookmarkSortOrder(editor.id, sortOrder)
      showToast(t('lists.updated'))
    } else {
      const id = lists$.addList(editor.name)
      if (id) {
        lists$.setBookmarkSortOrder(id, sortOrder)
        settings$.setLastSelectedListId(id)
        showToast(t('lists.created'))
      }
    }

    ui$.listEditor.set(null)
  }

  const onClose = () => ui$.listEditor.set(null)

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-6 gap-4">
        <NoriText className="text-xl font-semibold text-content">
          {editor.id ? t('lists.edit') : t('lists.new')}
        </NoriText>
        <NoriTextInput
          autoFocus={!editor.id}
          value={editor.name}
          onChangeText={(value) => ui$.listEditor.set({ ...editor, name: value })}
          onSubmitEditing={saveList}
          placeholder={t('lists.name')}
          placeholderTextColor={themeColors.contentSubtle}
          className="rounded-2xl border border-line bg-surface px-4 py-4 text-content"
        />
        <View className="gap-2">
          <NoriText className="text-sm font-medium text-content">{t('lists.sortOrder')}</NoriText>
          <NouMenu
            accessibilityLabel={t('lists.sortOrder')}
            items={sortOptions.map(({ order, label }) => ({
              label,
              selected: sortOrder === order,
              handler: () => ui$.listEditor.set({ ...editor, sortOrder: order }),
            }))}
            triggerClassName="rounded-2xl border border-line bg-surface px-4 py-4"
            trigger={<NoriText className="text-content">{sortOptions.find((option) => option.order === sortOrder)?.label}</NoriText>}
          />
        </View>
        <View className="flex-row justify-end gap-3">
          <Pressable onPress={onClose} className="rounded-full px-5 py-3 bg-muted active:bg-muted-strong">
            <NoriText className="text-content">{t('lists.cancel')}</NoriText>
          </Pressable>
          <Pressable onPress={saveList} className="rounded-full px-5 py-3 bg-accent-fill active:bg-accent-fill-pressed">
            <NoriText className="font-medium text-accent-on">{t('lists.save')}</NoriText>
          </Pressable>
        </View>
      </View>
    </BaseCenterModal>
  )
}
