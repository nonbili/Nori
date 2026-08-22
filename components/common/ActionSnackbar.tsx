import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dismissSnackbar, registerSnackbarHost, ui$, type SnackbarState } from '@/states/ui'

const TOOLBAR_BOTTOM_MARGIN = 16
const SNACKBAR_TOOLBAR_GAP = 8

function SnackbarRow({ snackbar }: { snackbar: SnackbarState }) {
  return (
    <View className="mt-2 w-full max-w-xl flex-row items-center rounded-2xl bg-stone-900 px-4 py-3 shadow-lg dark:bg-stone-100">
      <Text className="flex-1 text-sm font-medium text-stone-50 dark:text-stone-900">{snackbar.message}</Text>
      {snackbar.actionLabel && snackbar.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const action = snackbar.onAction
            dismissSnackbar(snackbar.id)
            action?.()
          }}
          className="ml-4 rounded-lg px-2 py-1 active:opacity-60"
        >
          <Text className="text-sm font-bold text-emerald-300 dark:text-emerald-700">{snackbar.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function ActionSnackbar() {
  const snackbars = useValue(ui$.snackbars)
  const hosts = useValue(ui$.snackbarHosts)
  const toolbarHeight = useValue(ui$.bookmarkToolbarHeight)
  const insets = useSafeAreaInsets()
  const [hostId, setHostId] = useState<number | null>(null)

  useEffect(() => {
    const host = registerSnackbarHost()
    setHostId(host.id)
    return host.unregister
  }, [])

  // Only the innermost host draws, so a sheet's copy replaces the root one
  // instead of rendering a second stack behind the modal.
  if (hostId === null || hosts[hosts.length - 1] !== hostId || !snackbars.length) {
    return null
  }

  // Sheets and the drawer cover the toolbar, so only the root stack avoids it.
  const isRootHost = hosts[0] === hostId

  return (
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      className="absolute inset-x-0 bottom-0 z-50 items-center px-4"
      // The home toolbar owns the bottom of the screen, so the stack sits above
      // it rather than covering its buttons.
      style={{
        paddingBottom: isRootHost && toolbarHeight > 0
          ? insets.bottom + TOOLBAR_BOTTOM_MARGIN + toolbarHeight + SNACKBAR_TOOLBAR_GAP
          : Math.max(insets.bottom, 16),
      }}
    >
      {snackbars.map((snackbar) => (
        <SnackbarRow key={snackbar.id} snackbar={snackbar} />
      ))}
    </View>
  )
}
