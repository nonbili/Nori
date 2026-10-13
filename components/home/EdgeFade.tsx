import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'

const withAlpha = (color: string, alpha: number) => color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)

// react-native-web would emit experimental_backgroundImage as an invalid CSS
// property, so web gets the plain one.
const gradient = (image: string) =>
  (Platform.OS === 'web' ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle

// A canvas-coloured gradient that dissolves tiles scrolling under it, so the
// list ends in a soft edge instead of a hard clip.
export const EdgeFade: React.FC<{ edge: 'top' | 'bottom'; height: number; color: string; solid?: number; alpha?: number }> = ({
  edge,
  height,
  color,
  solid = 0,
  alpha = 1,
}) => (
  <View
    pointerEvents="none"
    style={[
      styles.fade,
      edge === 'top' ? { top: 0 } : { bottom: 0 },
      { height, ...gradient(`linear-gradient(to ${edge === 'top' ? 'bottom' : 'top'}, ${withAlpha(color, alpha)} ${solid}%, ${withAlpha(color, 0)})`) },
    ]}
  />
)

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0 },
})
