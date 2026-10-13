import { Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useTranslation } from 'react-i18next'
import { settings$ } from '@/states/settings'
import { useThemeColors } from '@/lib/theme'
import { accentColor, isCustomAccent, type AccentId } from '@/lib/accent'
import { CustomAccentPicker } from '@/components/sheet/AccentPicker'

/** The swatch that opens the hue and intensity strips; see CustomAccent.tsx for the web one. */
export const CustomAccentSwatch: React.FC<{
  accent: AccentId
  isDark: boolean
  open: boolean
  onToggle: () => void
}> = ({ accent, isDark, open, onToggle }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const custom = isCustomAccent(accent)
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="radio"
      accessibilityState={{ selected: custom, expanded: open }}
      accessibilityLabel={t('settings.experience.accentCustom')}
      className={`h-9 w-9 items-center justify-center rounded-full border-2 active:opacity-70 ${
        custom ? 'border-content' : 'border-transparent'
      }`}
    >
      <View
        className="h-6 w-6 items-center justify-center rounded-full border border-line"
        style={custom ? { backgroundColor: accentColor(accent, isDark ? 400 : 600) } : undefined}
      >
        <MaterialIcons
          name={custom ? 'check' : 'palette'}
          // The check is a single stroke and reads at the preset swatches'
          // 14; the palette glyph carries far more detail in the same box.
          size={custom ? 14 : 18}
          color={custom ? themeColors.contentInverse : themeColors.contentMuted}
        />
      </View>
    </Pressable>
  )
}

export const CustomAccentPanel: React.FC<{ accent: AccentId; open: boolean }> = ({ accent, open }) =>
  open ? <CustomAccentPicker value={accent} onChange={(next) => settings$.setAccent(next)} /> : null
