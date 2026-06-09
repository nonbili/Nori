import { clsx, isIos, isWeb } from '@/lib/utils'
import { ReactNode, useEffect, useState } from 'react'
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

  const innerCls = clsx(
    'rounded-2xl bg-stone-50 dark:bg-stone-950 w-[30rem] lg:w-[40rem] xl:w-[50rem] max-w-[80vw]',
    containerClassName,
  )

  return (
    <Modal transparent animationType="fade" visible onRequestClose={handleBackdropPress}>
      <View
        className={clsx('flex-1 items-center', topAligned ? 'justify-start' : 'justify-center', className)}
        style={topAligned ? { paddingTop: insets.top + 12 } : undefined}
      >
        <Pressable className="absolute inset-0 bg-black/60" onPress={handleBackdropPress} />
        <KeyboardAvoidingView behavior={isIos ? 'padding' : 'height'} pointerEvents="box-none">
          <View className={innerCls}>{children}</View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
