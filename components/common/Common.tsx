import { type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useThemeColors } from '@/lib/theme'
import { Favicon } from '@/components/bookmark/Favicon'

export const ActionChip: React.FC<{
  icon: MaterialIconsIconName
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
          ? 'bg-contrast'
          : 'border border-line-strong bg-transparent'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <MaterialIcons name={icon} color={themeColors.contentInverse} size={18} />
        {label ? <NoriText className="text-sm font-medium text-content-inverse">{label}</NoriText> : null}
      </View>
    </Pressable>
  )
}

export const SectionLabel: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View className="mb-4 items-center gap-1">
    <NoriText className="text-xs uppercase tracking-[0.2em] text-content-subtle">{title}</NoriText>
    {subtitle ? <NoriText className="text-center text-sm text-content-muted">{subtitle}</NoriText> : null}
  </View>
)

export const SettingsRow: React.FC<{
  icon: MaterialIconsIconName
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
      className={`flex-row items-center gap-3 px-4 py-4 active:bg-muted ${
        !isLast ? 'border-b border-line' : ''
      }`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
        <MaterialIcons name={icon} color={themeColors.contentMuted} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <NoriText className="flex-1 font-medium text-content">{title}</NoriText>
          {value ? <NoriText className="text-xs uppercase tracking-[0.16em] text-content-subtle">{value}</NoriText> : null}
        </View>
        {description ? <NoriText className="mt-1 text-sm leading-5 text-content-muted">{description}</NoriText> : null}
      </View>
      {value ? <NoriText className="text-sm font-medium text-content-secondary">{value}</NoriText> : null}
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
    className={`rounded-full px-4 py-2 ${active ? 'bg-accent-fill' : 'bg-muted'}`}
  >
    <NoriText className={`text-sm font-medium ${active ? 'text-accent-on' : 'text-content-secondary'}`}>{label}</NoriText>
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
    <View className={`flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 ${className}`}>
      <Pressable onPress={onPress} disabled={!onPress} className="flex-1 flex-row items-center gap-3">
        {left}
        <View className="flex-1">
          <NoriText className="text-sm font-medium text-content" numberOfLines={1}>
            {title}
          </NoriText>
          {subtitle ? (
            <NoriText className="mt-1 text-xs text-content-subtle" numberOfLines={1}>
              {subtitle}
            </NoriText>
          ) : null}
        </View>
      </Pressable>
      <View className="flex-row items-center gap-1.5">{actions}</View>
    </View>
  )
}

export const IconAction: React.FC<{
  icon: MaterialIconsIconName
  onPress: () => void
  tint?: 'default' | 'danger' | 'accent'
}> = ({ icon, onPress, tint = 'default' }) => {
  const themeColors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full p-2 ${
        tint === 'danger'
          ? 'bg-danger-100 dark:bg-danger-900/40'
          : tint === 'accent'
            ? 'bg-accent-100 dark:bg-accent-900/30'
            : 'bg-muted'
      }`}
    >
      <MaterialIcons
        name={icon}
        size={16}
        color={
          tint === 'danger'
            ? themeColors.danger
            : tint === 'accent'
              ? themeColors.accent
              : themeColors.contentMuted
        }
      />
    </Pressable>
  )
}
