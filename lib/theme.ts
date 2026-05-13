import { useColorScheme } from 'nativewind'
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native'

const lightColors = {
  icon: '#292524',
  iconMuted: '#78716c',
  iconSubtle: '#a8a29e',
  iconAccent: '#047857',
  iconAccentStrong: '#6ee7b7',
  iconDanger: '#ef4444',
  iconInverse: '#f5f5f4',
  placeholder: '#78716c',
  surface: '#ffffff',
  surfaceBorder: '#e7e5e4',
  textPrimary: '#1c1917',
}

const darkColors = {
  icon: '#fafaf9',
  iconMuted: '#a8a29e',
  iconSubtle: '#a8a29e',
  iconAccent: '#6ee7b7',
  iconAccentStrong: '#6ee7b7',
  iconDanger: '#ef4444',
  iconInverse: '#f5f5f4',
  placeholder: '#78716c',
  surface: '#0c0a09',
  surfaceBorder: '#292524',
  textPrimary: '#f5f5f4',
}

export type ThemeColors = typeof lightColors

export const useAppColorScheme = (): 'light' | 'dark' => {
  const { colorScheme: nativeWindScheme } = useColorScheme()
  const rnScheme = useRNColorScheme()
  return nativeWindScheme ?? rnScheme ?? 'light'
}

export const getThemeColors = (colorScheme: 'dark' | 'light' | null | undefined): ThemeColors => {
  const scheme = colorScheme ?? Appearance.getColorScheme()
  return scheme === 'dark' ? darkColors : lightColors
}

export const useThemeColors = (): ThemeColors => {
  const colorScheme = useAppColorScheme()
  return getThemeColors(colorScheme)
}
