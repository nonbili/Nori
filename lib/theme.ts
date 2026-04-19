import { useColorScheme } from 'nativewind'

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

export const getThemeColors = (colorScheme: 'dark' | 'light' | null | undefined): ThemeColors =>
  colorScheme === 'dark' ? darkColors : lightColors

export const useThemeColors = (): ThemeColors => {
  const { colorScheme } = useColorScheme()
  return getThemeColors(colorScheme)
}
