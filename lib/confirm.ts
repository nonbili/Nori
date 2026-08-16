import { Alert } from 'react-native'
import { isWeb } from './utils'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
  destructive?: boolean
}

// react-native-web ships Alert as a no-op stub, so an Alert-based promise would
// never settle on web and would hang whatever awaits it. Fall back to the
// browser's own confirm there.
export function confirmAction({ title, message, confirmText, cancelText, destructive }: ConfirmOptions) {
  if (isWeb) {
    return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(`${title}\n\n${message}`)
      : false)
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      // Android dismisses via back button/outside tap without firing either
      // button, which would leave the caller pending forever.
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}
