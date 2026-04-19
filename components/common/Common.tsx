import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useThemeColors } from '@/lib/theme'
import { Favicon } from '@/components/bookmark/Favicon'

export const ActionChip: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap
  label?: string
  onPress: () => void
  variant?: 'outline' | 'filled'
}> = ({ icon, label, onPress, variant = 'filled' }) => {
  const themeColors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 active:opacity-70 ${
        variant === 'filled'
          ? 'bg-stone-900 dark:bg-stone-800'
          : 'border border-stone-300 bg-transparent dark:border-stone-700'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <MaterialIcons name={icon} color={themeColors.iconInverse} size={18} />
        {label ? <Text className="text-sm font-medium text-stone-50 dark:text-stone-100">{label}</Text> : null}
      </View>
    </Pressable>
  )
}

export const SectionLabel: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View className="mb-4 items-center gap-1">
    <Text className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500">{title}</Text>
    {subtitle ? <Text className="text-center text-sm text-stone-600 dark:text-stone-400">{subtitle}</Text> : null}
  </View>
)

export const SettingsRow: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  description?: string
  value?: string
  onPress: () => void
  isLast?: boolean
}> = ({ icon, title, description, value, onPress, isLast = false }) => {
  const themeColors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-4 active:bg-stone-100 dark:active:bg-stone-900 ${
        !isLast ? 'border-b border-stone-200 dark:border-stone-800' : ''
      }`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
        <MaterialIcons name={icon} color={themeColors.iconMuted} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 font-medium text-stone-900 dark:text-stone-100">{title}</Text>
          {value ? <Text className="text-xs uppercase tracking-[0.16em] text-stone-500">{value}</Text> : null}
        </View>
        {description ? <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{description}</Text> : null}
      </View>
      {value ? <Text className="text-sm font-medium text-stone-700 dark:text-stone-300">{value}</Text> : null}
    </Pressable>
  )
}

export const SegmentedOption: React.FC<{
  active: boolean
  label: string
  onPress: () => void
}> = ({ active, label, onPress }) => (
  <Pressable
    onPress={onPress}
    className={`rounded-full px-4 py-2 ${active ? 'bg-stone-900 dark:bg-stone-100' : 'bg-stone-200 dark:bg-stone-800'}`}
  >
    <Text className={`text-sm font-medium ${active ? 'text-stone-50 dark:text-stone-950' : 'text-stone-700 dark:text-stone-300'}`}>{label}</Text>
  </Pressable>
)

export const ManageRow: React.FC<{
  title: string
  subtitle?: string
  left?: ReactNode
  actions: ReactNode
  onPress?: () => void
  className?: string
}> = ({ title, subtitle, left, actions, onPress, className }) => {
  return (
    <View className={`flex-row items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900 ${className}`}>
      <Pressable onPress={onPress} disabled={!onPress} className="flex-1 flex-row items-center gap-3">
        {left}
        <View className="flex-1">
          <Text className="text-sm font-medium text-stone-900 dark:text-stone-100" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-1 text-xs text-stone-500" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View className="flex-row items-center gap-1.5">{actions}</View>
    </View>
  )
}

export const IconAction: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  tint?: 'default' | 'danger' | 'accent'
}> = ({ icon, onPress, tint = 'default' }) => {
  const themeColors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full p-2 ${
        tint === 'danger'
          ? 'bg-rose-950/40'
          : tint === 'accent'
            ? 'bg-emerald-950/30'
            : 'bg-stone-200 dark:bg-stone-800'
      }`}
    >
      <MaterialIcons
        name={icon}
        size={16}
        color={
          tint === 'danger'
            ? themeColors.iconDanger
            : tint === 'accent'
              ? themeColors.iconAccentStrong
              : themeColors.iconMuted
        }
      />
    </Pressable>
  )
}
