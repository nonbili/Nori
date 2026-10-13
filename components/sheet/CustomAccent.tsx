import { View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useTranslation } from 'react-i18next'
import { settings$ } from '@/states/settings'
import { useThemeColors } from '@/lib/theme'
import { accentChannels, accentColor, isCustomAccent, type AccentId } from '@/lib/accent'
import { channelsToRgb, hexToRgb, rgbToHex } from '@/lib/oklch'

/**
 * The custom accent, as the browser's own colour picker.
 *
 * The app builds hue and intensity strips by hand because React Native has no
 * picker (CustomAccent.native.tsx); on the web there is one, and it is the
 * control people already know, so the extension and desktop shells use it
 * instead. The input is hidden behind the swatch it opens, and updates live
 * while dragging.
 */
export const CustomAccentSwatch: React.FC<{
  accent: AccentId
  isDark: boolean
  open: boolean
  onToggle: () => void
}> = ({ accent, isDark }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const custom = isCustomAccent(accent)
  return (
    <label
      aria-label={t('settings.experience.accentCustom')}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 ${
        custom ? 'border-content' : 'border-transparent'
      }`}
    >
      <View
        className="h-6 w-6 items-center justify-center rounded-full border border-line"
        style={custom ? { backgroundColor: accentColor(accent, isDark ? 400 : 600) } : undefined}
      >
        <MaterialIcons
          name={custom ? 'check' : 'palette'}
          // The palette glyph needs more room than the presets' check mark.
          size={custom ? 14 : 18}
          color={custom ? themeColors.contentInverse : themeColors.contentMuted}
        />
      </View>
      <input
        type="color"
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
        // The stored colour when there is one, rather than the ramp's 600:
        // generation rescales chroma, so feeding the 600 back would walk the
        // picker's colour a little further each time it was opened.
        value={(custom ? hexToRgb(accent) : null) ? accent : rgbToHex(channelsToRgb(accentChannels(accent, 600)))}
        onChange={(event) => settings$.setAccent(event.target.value as AccentId)}
      />
    </label>
  )
}

/** The browser's picker is its own popup, so nothing unfolds below the swatches. */
export const CustomAccentPanel: React.FC<{ accent: AccentId; open: boolean }> = () => null
