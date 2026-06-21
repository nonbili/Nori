import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { drainAppShareInbox, drainQuickShareInbox, resolveQuickShareTargetListId, syncQuickShareNativeConfig } from '@/lib/quick-share'

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
    void drainQuickShareInbox()
    void drainAppShareInbox()
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void drainQuickShareInbox()
        void drainAppShareInbox()
      }
    })

    return () => subscription.remove()
  }, [])
}
