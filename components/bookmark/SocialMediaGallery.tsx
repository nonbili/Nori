import { useCallback, useEffect } from 'react'
import { Image } from 'expo-image'
import { Modal, Platform, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { NoriText } from '@/components/common/NoriText'
import type { SocialMedia } from '@/lib/social-post'
import { useSavedImage } from './useSavedImage'

const SWIPE_DISTANCE = 60

function GalleryButton({ icon, label, onPress }: { icon: MaterialIconsIconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    className="h-11 w-11 items-center justify-center rounded-full bg-black/50 active:bg-black/70">
    <MaterialIcons name={icon} size={26} color="#fff" />
  </Pressable>
}

function Slide({ item }: { item: SocialMedia }) {
  const uri = useSavedImage(item)
  return uri ? <Image source={{ uri }} accessibilityLabel={item.alt} style={{ flex: 1, width: '100%' }} contentFit="contain" /> : <View className="flex-1" />
}

/** A post's media full screen, one at a time; `index` is undefined while closed. */
export function SocialMediaGallery({ media, index, onChange, onClose }: {
  media: SocialMedia[]
  index?: number
  onChange: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const visible = index !== undefined && index < media.length
  const current = index ?? 0
  const step = useCallback((delta: number) => {
    const next = current + delta
    if (next >= 0 && next < media.length) onChange(next)
  }, [current, media.length, onChange])

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'Escape') onClose()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, step, onClose])

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onEnd((event) => {
      'worklet'
      if (event.translationX < -SWIPE_DISTANCE) runOnJS(step)(1)
      else if (event.translationX > SWIPE_DISTANCE) runOnJS(step)(-1)
    })

  if (!visible) return null
  const item = media[current]
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-4 py-2">
          <NoriText className="text-sm text-white">{media.length > 1 ? `${current + 1} / ${media.length}` : ''}</NoriText>
          <GalleryButton icon="close" label={t('common.close')} onPress={onClose} />
        </View>
        <GestureDetector gesture={swipe}>
          <View className="flex-1 justify-center">
            <Slide key={`${item.cacheKey}:${current}`} item={item} />
            {current > 0 ? <View className="absolute left-3">
              <GalleryButton icon="chevron-left" label={t('socialPost.previousImage')} onPress={() => step(-1)} />
            </View> : null}
            {current < media.length - 1 ? <View className="absolute right-3">
              <GalleryButton icon="chevron-right" label={t('socialPost.nextImage')} onPress={() => step(1)} />
            </View> : null}
          </View>
        </GestureDetector>
        {item.alt ? <NoriText className="px-4 py-3 text-sm text-white/80" numberOfLines={4}>{item.alt}</NoriText> : null}
      </View>
    </GestureHandlerRootView>
  </Modal>
}
