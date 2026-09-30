import { View } from 'react-native'

// Web: a real backdrop blur with a specular rim, drawn as inset box-shadows so
// the highlight follows the pill's curve. GlassPill.native.tsx does the native
// side, where there is no backdrop blur to lean on.
export const GlassPill: React.FC<{ gap?: string; className?: string; children: React.ReactNode }> = ({
  gap = 'gap-1',
  className = '',
  children,
}) => (
  <View
    className={`flex-row items-center ${gap} ${className} rounded-full bg-white/40 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.05)] web:backdrop-blur-2xl web:backdrop-saturate-200 dark:bg-white/[0.07] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_0_1px_rgba(255,255,255,0.10)]`}
  >
    {children}
  </View>
)
