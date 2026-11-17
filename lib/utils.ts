import 'react-native-get-random-values'
import { nanoid } from 'nanoid'
import type { ReactNode } from 'react'

import { Platform } from 'react-native'

export const isWeb = typeof document != 'undefined'
export const isIos = Platform.OS === 'ios'
export const isAndroid = Platform.OS === 'android'

export const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ')

// In react-native, writing {condition && <Cmp/>} triggers `A text node cannot be a child of a <View>` warning.
export const nIf = (condition: any, node: ReactNode) => (condition ? node : null)

export function genId(size = 6) {
  return nanoid(size)
}

/** UUID v4 using the random-values polyfill available on native and the browser. */
export function newUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
