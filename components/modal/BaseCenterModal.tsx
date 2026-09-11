import { clsx, isIos, isWeb } from '@/lib/utils'
import { useEffect, useState, type ReactNode } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const BaseCenterModal: React.FC<{
  className?: string
  containerClassName?: string
  align?: 'center' | 'top' | 'keyboard'
  children: ReactNode
  onClose: () => void
}> = ({ className, containerClassName, align = 'keyboard', children, onClose }) => {
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    if (isWeb) {
      return
    }

    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  useEffect(() => {
    return () => {
      Keyboard.dismiss()
    }
  }, [])

  const handleBackdropPress = () => {
    if (!isWeb && keyboardVisible) {
      Keyboard.dismiss()
      return
    }
    onClose()
  }

  const topAligned = align === 'top' || (align === 'keyboard' && keyboardVisible)

  // `max-w-full` only resolves against a parent with a definite width, so the
  // keyboard wrapper below stretches and carries the gutter on every platform.
  // A calc()-based max-width is dropped on native, which let the dialog grow to
  // the full screen width on phones.
  const innerCls = clsx(
    'w-[30rem] max-w-full self-center rounded-2xl bg-canvas lg:w-[40rem] xl:w-[50rem]',
    containerClassName,
  )

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleBackdropPress}>
      <View className="flex-1 items-center justify-center" pointerEvents="box-none">
        <View
          testID="app_modal_frame"
          className={clsx('flex-1 self-stretch items-center overflow-hidden', topAligned ? 'justify-start' : 'justify-center', className)}
          style={[
            topAligned ? { paddingTop: insets.top + 12 } : undefined,
          ]}
        >
          <Pressable className="absolute inset-0 bg-black/60" onPress={handleBackdropPress} />
          <KeyboardAvoidingView
            behavior={isIos ? 'padding' : 'height'}
            pointerEvents="box-none"
            style={{ alignSelf: 'stretch', marginHorizontal: 16 }}
          >
            <View
              className={innerCls}
              style={isWeb ? { alignSelf: 'center', width: '100%', maxWidth: 800 } : undefined}
            >
              {children}
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  )
}
