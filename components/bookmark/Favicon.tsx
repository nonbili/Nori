import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useThemeColors } from '@/lib/theme'
import { getRuntimeFaviconCandidates } from '@/lib/bookmark'

export const Favicon: React.FC<{
  iconUrl?: string
  pageUrl?: string
  slotSize: number
  iconSize: number
  fallbackIconSize?: number
  wrapperClassName?: string
}> = ({ iconUrl, pageUrl, slotSize, iconSize, fallbackIconSize = 14, wrapperClassName }) => {
  const themeColors = useThemeColors()
  const candidates = useMemo(() => getRuntimeFaviconCandidates(pageUrl, iconUrl), [pageUrl, iconUrl])
  const [candidateIndex, setCandidateIndex] = useState(0)

  useEffect(() => {
    setCandidateIndex(0)
  }, [candidates])

  const activeUrl = candidates[candidateIndex]

  return (
    <View
      className={wrapperClassName || 'items-center justify-center overflow-hidden rounded-sm bg-stone-100 dark:bg-stone-800'}
      style={{ width: slotSize, height: slotSize }}
    >
      {activeUrl ? (
        <Image
          source={activeUrl}
          style={{ width: iconSize, height: iconSize }}
          contentFit="contain"
          onError={() => {
            setCandidateIndex((current) => (current < candidates.length - 1 ? current + 1 : current))
          }}
        />
      ) : (
        <MaterialIcons name="language" color={themeColors.iconSubtle} size={fallbackIconSize} />
      )}
    </View>
  )
}
