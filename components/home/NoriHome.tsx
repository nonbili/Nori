import { View } from 'react-native'
import { AllBookmarksDrawer } from '@/components/drawer/AllBookmarksDrawer'
import { BookmarkImportSheet } from '@/components/sheet/BookmarkImportSheet'
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
  menuItems,
  onOpenSettings,
  renderMain,
  settingsSheet,
}: {
  newBookmarkDefaults?: Partial<Pick<BookmarkRecord, 'url' | 'title' | 'icon'>>
  menuItems?: NouMenuItem[]
  onOpenSettings?: () => void
  renderMain?: (main: ReactElement) => ReactElement
  settingsSheet?: ReactElement | null
} = {}) {
  const main = (
    <View className="flex-1">
      <BookmarkPager
        newBookmarkDefaults={newBookmarkDefaults}
        menuItems={menuItems}
        onOpenSettings={onOpenSettings}
      />
    </View>
  )

  return (
    <View className="flex-1 bg-canvas">
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
