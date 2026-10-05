import { useEffect } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { buildHomeWidgetSnapshot } from '@/lib/home-widget'
import { isWidgetSupported, setWidgetData } from '@/modules/nori-widget'

/** Keeps the Android home screen widgets in step with lists, bookmarks and the settings they honour. */
export function useHomeWidget() {
  const { t } = useTranslation()
  const lists = useValue(lists$.lists)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const openInSystemBrowser = useValue(settings$.openInSystemBrowser)
  const showFavicon = useValue(settings$.showFavicon)

  useEffect(() => {
    if (!isWidgetSupported) {
      return
    }

    // Edits tend to arrive in bursts (reorder, import, sync), so write once they settle.
    const timer = setTimeout(() => {
      const snapshot = buildHomeWidgetSnapshot(lists, bookmarks, {
        openInSystemBrowser,
        showFavicon: showFavicon !== false,
        strings: { chooseList: t('lists.choose'), empty: t('history.noBookmarks') },
      })
      void setWidgetData(JSON.stringify(snapshot)).catch(() => {})
    }, 500)

    return () => clearTimeout(timer)
  }, [lists, bookmarks, openInSystemBrowser, showFavicon, t])
}
