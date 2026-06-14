import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { useThemeColors } from '@/lib/theme'
import { getRuntimeFaviconCandidates } from '@/lib/bookmark'
import { settings$ } from '@/states/settings'

export const Favicon: React.FC<{
  iconUrl?: string
  pageUrl?: string
  slotSize: number
  iconSize: number
  fallbackIconSize?: number
  wrapperClassName?: string
}> = ({ iconUrl, pageUrl, slotSize, iconSize, fallbackIconSize = 14, wrapperClassName }) => {
  const themeColors = useThemeColors()
  const showFavicon = useValue(settings$.showFavicon)
  const candidates = useMemo(() => getRuntimeFaviconCandidates(pageUrl, iconUrl), [pageUrl, iconUrl])
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set())

  const activeUrl = candidates.find((candidate) => !failedUrls.has(candidate))
  const className = showFavicon === false
    ? 'items-center justify-center overflow-hidden'
    : wrapperClassName || 'items-center justify-center overflow-hidden rounded-sm bg-stone-100 dark:bg-stone-800'

  return (
    <View
      className={className}
      style={{ width: slotSize, height: slotSize }}
    >
      {showFavicon === false ? (
        <Image
          source={require('../../assets/images/adaptive-icon.png')}
          style={{ width: iconSize * 1.4, height: iconSize * 1.4 }}
          contentFit="contain"
        />
      ) : activeUrl ? (
        <Image
          source={activeUrl}
          style={{ width: iconSize, height: iconSize }}
          contentFit="contain"
          onError={() => {
            setFailedUrls((current) => {
              const next = new Set(current)
              next.add(activeUrl)
              return next
            })
          }}
        />
      ) : (
        <MaterialIcons name="language" color={themeColors.iconSubtle} size={fallbackIconSize} />
      )}
    </View>
  )
}
