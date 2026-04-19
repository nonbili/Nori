import { useValue } from '@legendapp/state/react'
import { Text, TextInput, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BaseCenterModal } from '@/components/modal/BaseCenterModal'
import { useThemeColors } from '@/lib/theme'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'

export const ListEditorSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const editor = useValue(ui$.listEditor)

  if (!editor) {
    return null
  }

  const saveList = () => {
    if (!editor.name.trim()) {
      showToast(t('lists.enterName'))
      return
    }

    if (editor.id) {
      lists$.renameList(editor.id, editor.name)
      showToast(t('lists.updated'))
    } else {
      const id = lists$.addList(editor.name)
      if (id) {
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
        <Text className="text-xl font-semibold text-stone-900 dark:text-stone-50">
          {editor.id ? t('lists.rename') : t('lists.new')}
        </Text>
        <TextInput
          autoFocus={!editor.id}
          value={editor.name}
          onChangeText={(value) => ui$.listEditor.set({ ...editor, name: value })}
          onSubmitEditing={saveList}
          placeholder={t('lists.name')}
          placeholderTextColor={themeColors.placeholder}
          className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50"
        />
        <View className="flex-row justify-end gap-3">
          <Pressable onPress={onClose} className="rounded-full px-5 py-3 bg-stone-200 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700">
            <Text className="text-stone-900 dark:text-stone-100">{t('lists.cancel')}</Text>
          </Pressable>
          <Pressable onPress={saveList} className="rounded-full px-5 py-3 bg-emerald-500 active:bg-emerald-600">
            <Text className="font-medium text-white">{t('lists.save')}</Text>
          </Pressable>
        </View>
      </View>
    </BaseCenterModal>
  )
}
