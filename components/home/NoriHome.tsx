import { View } from 'react-native'
import { useValue } from '@legendapp/state/react'

import { ui$ } from '@/states/ui'
import { AllBookmarksDrawer } from '@/components/drawer/AllBookmarksDrawer'
import { BookmarkImportSheet } from '@/components/sheet/BookmarkImportSheet'
import { AppHeader } from '@/components/header/AppHeader'
import { BookmarkPager } from '@/components/home/BookmarkPager'
import { BookmarkEditorSheet } from '@/components/sheet/BookmarkEditorSheet'
import { ManageListsSheet } from '@/components/sheet/ManageListsSheet'
import { RecentlyUsedSheet } from '@/components/sheet/RecentlyUsedSheet'
import { SaveSharedLinkSheet } from '@/components/sheet/SaveSharedLinkSheet'
import { SettingsSheet } from '@/components/sheet/SettingsSheet'
import { ListEditorSheet } from '@/components/sheet/ListEditorSheet'
import type { BookmarkRecord } from '@/states/bookmarks'
import type { NouMenuItem } from '@/components/menu/NouMenu'
import type { ReactElement } from 'react'

/** The platform-neutral Nori application surface shared by native and web hosts. */
export function NoriHome({
  newBookmarkDefaults,
  headerMenuItems,
  onOpenSettings,
  renderMain,
  settingsSheet,
}: {
  newBookmarkDefaults?: Partial<Pick<BookmarkRecord, 'url' | 'title' | 'icon'>>
  headerMenuItems?: NouMenuItem[]
  onOpenSettings?: () => void
  renderMain?: (main: ReactElement) => ReactElement
  settingsSheet?: ReactElement | null
} = {}) {
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const main = (
    <View className="flex-1">
      {!bookmarkEditMode ? (
        <AppHeader additionalMenuItems={headerMenuItems} onOpenSettings={onOpenSettings} />
      ) : null}
      <BookmarkPager newBookmarkDefaults={newBookmarkDefaults} />
    </View>
  )

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950">
      {renderMain ? renderMain(main) : main}

      <AllBookmarksDrawer />
      <RecentlyUsedSheet />
      {settingsSheet === undefined ? <SettingsSheet /> : settingsSheet}
      <ManageListsSheet />
      <BookmarkEditorSheet />
      <ListEditorSheet />
      <SaveSharedLinkSheet />
      <BookmarkImportSheet />
    </View>
  )
}
