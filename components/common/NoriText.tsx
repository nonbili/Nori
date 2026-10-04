import { forwardRef } from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { cssInterop } from 'nativewind'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { fontFamilyForPlatform, normalizeFontFamily, normalizeFontScale } from '@/lib/typography'

export function useTypographyStyle(style?: TextStyle): TextStyle {
  const scale = normalizeFontScale(useValue(settings$.fontScale))
  const family = normalizeFontFamily(useValue(settings$.fontFamily))
  return {
    fontFamily: style?.fontFamily ?? fontFamilyForPlatform(family, Platform.OS),
    ...(Platform.OS === 'web' && style?.fontSize === undefined ? {} : { fontSize: (style?.fontSize ?? 14) * scale }),
    ...(style?.lineHeight === undefined ? {} : { lineHeight: style.lineHeight * scale }),
  }
}

const StyledText = forwardRef<Text, TextProps>(({ style, ...props }, ref) => {
  const typography = useTypographyStyle(StyleSheet.flatten(style))
  return <Text ref={ref} {...props} style={[style, typography]} />
})
StyledText.displayName = 'StyledNoriText'
const InteropText = cssInterop(StyledText, { className: 'style' })
const withDefaultSize = (className = '') =>
  /(?:^|\s)(?:[\w-]+:)*text-(?:2xs|tiny|xs|sm|base|lg|xl|[2-9]xl|\[[\d.])/.test(className)
    ? className
    : `text-nori-default ${className}`

export const NoriText = forwardRef<Text, TextProps>(({ className, ...props }, ref) => (
  <InteropText ref={ref} {...props} className={Platform.OS === 'web' ? withDefaultSize(className) : className} />
))
NoriText.displayName = 'NoriText'

const StyledInput = forwardRef<TextInput, TextInputProps>(({ style, ...props }, ref) => {
  const typography = useTypographyStyle(StyleSheet.flatten(style))
  return <TextInput ref={ref} {...props} style={[style, typography]} />
})
StyledInput.displayName = 'StyledNoriTextInput'
const InteropInput = cssInterop(StyledInput, { className: 'style' })
export const NoriTextInput = forwardRef<TextInput, TextInputProps>(({ className, ...props }, ref) => (
  <InteropInput ref={ref} {...props} className={Platform.OS === 'web' ? withDefaultSize(className) : className} />
))
NoriTextInput.displayName = 'NoriTextInput'
