import Animated from 'react-native-reanimated'
import { cssInterop } from 'nativewind'

// Reanimated's animated components are not in NativeWind's built-in interop
// registry. On native the Babel transform still resolves their `className`, but
// on web the prop reaches react-native-web untouched and is dropped, so every
// shared component that animates — the drawer, the sheets, the pager — renders
// without its layout classes. Registering them restores `className` support.
cssInterop(Animated.View, { className: 'style' })
cssInterop(Animated.Text, { className: 'style' })
cssInterop(Animated.ScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})
