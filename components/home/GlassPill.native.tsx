import { StyleSheet, View } from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useAppColorScheme } from '@/lib/theme'

const fill = StyleSheet.absoluteFill

// iOS 26 gets the system Liquid Glass. Everywhere else (Android has no
// backdrop blur in React Native) the glass is faked with layers: a translucent
// body, a specular sheen fading from the top edge, and a bright rim, and in
// light mode a soft edge shadow so the rim reads against a pale canvas.
export const GlassPill: React.FC<{ gap?: string; className?: string; children: React.ReactNode }> = ({
  gap = 'gap-1',
  className = '',
  children,
}) => {
  const dark = useAppColorScheme() === 'dark'
  const native = isLiquidGlassAvailable()

  return (
    <View
      className={`flex-row items-center ${gap} ${className} rounded-full p-2`}
      style={{
        borderRadius: 999,
        boxShadow: dark
          ? '0 8px 24px rgba(0,0,0,0.35)'
          : '0 8px 24px rgba(20,24,40,0.12), 0 0 0 0.5px rgba(90,100,130,0.22)',
      }}
    >
      {native ? (
        <GlassView pointerEvents="none" glassEffectStyle="regular" style={[fill, { borderRadius: 999 }]} />
      ) : (
        <>
          <View
            pointerEvents="none"
            style={[
              fill,
              {
                borderRadius: 999,
                backgroundColor: dark ? 'rgba(48,50,60,0.55)' : 'rgba(255,255,255,0.62)',
                experimental_backgroundImage: dark
                  ? 'linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 55%, rgba(255,255,255,0.06))'
                  : 'linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0.15) 55%, rgba(120,130,160,0.10))',
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              fill,
              {
                borderRadius: 999,
                borderWidth: 1,
                borderColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)',
              },
            ]}
          />
        </>
      )}
      {children}
    </View>
  )
}
