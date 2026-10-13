import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'

export type IconName = MaterialIconsIconName

// The same Material glyphs the Android app and the shared components draw, by
// the same names, so the shells' own rows match the rest of the UI. The colour
// is inherited from the surrounding CSS.
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <MaterialIcons name={name} size={size} color="currentColor" aria-hidden />
}
