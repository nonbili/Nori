import { forwardRef } from 'react'
import { Platform, Text, type TextProps, type TextStyle } from 'react-native'

export const noriTextStyle: TextStyle | undefined = Platform.OS === 'web'
  ? { fontFamily: 'Inter Variable' }
  : undefined

export const NoriText = forwardRef<Text, TextProps>(({ style, ...props }, ref) => (
  <Text ref={ref} {...props} style={[noriTextStyle, style]} />
))

NoriText.displayName = 'NoriText'
