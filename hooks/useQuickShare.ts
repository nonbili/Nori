import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { drainAppShareInbox, drainQuickShareInbox, resolveQuickShareTargetListId, syncQuickShareNativeConfig } from '@/lib/quick-share'
import { backfillMissingTitles } from '@/lib/title-backfill'

export function useQuickShare() {
  const quickSaveSharedLinks = useValue(settings$.quickSaveSharedLinks)
  const quickSaveShareListId = useValue(settings$.quickSaveShareListId)
  const lists = useValue(lists$.lists)

  useEffect(() => {
    const targetListId = resolveQuickShareTargetListId(quickSaveShareListId)
    if (quickSaveSharedLinks && targetListId && quickSaveShareListId !== targetListId) {
      settings$.setQuickSaveShareListId(targetListId)
      return
    }

    void syncQuickShareNativeConfig()
  }, [quickSaveSharedLinks, quickSaveShareListId, lists])

  useEffect(() => {
    const drainAndBackfill = async () => {
      await drainQuickShareInbox()
      await drainAppShareInbox()
      // Quick-share saves bookmarks with a hostname placeholder title (no UI/WebView
      // available at save time); now that we're foregrounded, fill in real titles.
      void backfillMissingTitles()
    }

    void drainAndBackfill()
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void drainAndBackfill()
      }
    })

    return () => subscription.remove()
  }, [])
}
