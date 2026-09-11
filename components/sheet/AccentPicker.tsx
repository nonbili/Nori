import { useMemo, useState } from 'react'
import { TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/lib/theme'
import {
  accentChannels,
  accentHexFor,
  hueColor,
  isCustomAccent,
  normalizeAccent,
  PICKED_LIGHTNESS,
  type AccentId,
  type CustomAccent,
} from '@/lib/accent'
import { channelsToRgb, hexToRgb, maxChroma, oklchToRgb, rgbToHex, rgbToOklch } from '@/lib/oklch'

/** Enough segments that the strip reads as a gradient without an SVG or a gradient dep. */
const SEGMENTS = 48

/**
 * A tappable, draggable colour strip.
 *
 * Built from solid segments and the built-in responder props rather than a
 * gradient library and a gesture handler: this same component renders in the
 * Expo app and, through react-native-web, in the extension and desktop shells,
 * and the responder props are the part all three agree on.
 */
const Strip: React.FC<{
  colorAt: (fraction: number) => string
  fraction: number
  onPick: (fraction: number) => void
  label: string
}> = ({ colorAt, fraction, onPick, label }) => {
  const [width, setWidth] = useState(0)
  const themeColors = useThemeColors()

  const segments = useMemo(
    () => Array.from({ length: SEGMENTS }, (_, index) => colorAt((index + 0.5) / SEGMENTS)),
    [colorAt],
  )

  const pick = (event: GestureResponderEvent) => {
    if (width <= 0) return
    const x = event.nativeEvent.locationX
    onPick(Math.min(Math.max(x / width, 0), 1))
  }

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={pick}
      onResponderMove={pick}
      className="h-9 justify-center"
    >
      {/* Untouchable, so the responder above stays the touch target: locationX
          is relative to whatever was actually touched, and a segment would
          report a few pixels of its own width instead of a position on the
          strip. */}
      <View pointerEvents="none" className="h-7 flex-row overflow-hidden rounded-full border border-line">
        {segments.map((color, index) => (
          <View key={index} style={{ flex: 1, backgroundColor: color }} />
        ))}
      </View>
      {width > 0 ? (
        <View
          pointerEvents="none"
          className="absolute h-7 w-7 rounded-full border-2"
          style={{
            // Half the knob, so it tracks the finger instead of trailing it.
            left: fraction * width - 14,
            borderColor: themeColors.surface,
            backgroundColor: colorAt(fraction),
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        />
      ) : null}
    </View>
  )
}

/**
 * Hue, intensity and a hex field for picking an accent outside the presets.
 *
 * The hex field is not a duplicate of the strips: it is the only way to match
 * a colour you already have - a brand, a wallpaper - which is most of why an
 * arbitrary accent is worth having over a longer preset list.
 */
export const CustomAccentPicker: React.FC<{
  value: AccentId
  onChange: (accent: CustomAccent) => void
}> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()

  // A custom accent reads back from the stored hex, not from the generated 600
  // step: generation rescales chroma against a curated curve, so seeding from
  // the ramp would land the knob somewhere other than where it was dropped.
  // A preset has no stored hex, so it seeds from its own 600 - which is the
  // colour on screen, and keeps opening the picker from a sensible place.
  const seed = useMemo(() => {
    const id = normalizeAccent(value)
    const picked = isCustomAccent(id) ? hexToRgb(id) : null
    return rgbToOklch(picked ?? channelsToRgb(accentChannels(id, 600)))
  }, [value])
  // A grey has no recoverable hue, so the strips cannot be a pure function of
  // the stored colour: sliding intensity to zero would otherwise throw the hue
  // knob to wherever OKLCH reports for grey. Holding the last hue here keeps
  // the knob still, and keeps sliding back up returning the colour you left.
  const [heldHue, setHeldHue] = useState<number | null>(null)
  const isCustom = isCustomAccent(normalizeAccent(value))
  // A preset swatch tapped while the picker is open replaces the held hue -
  // the strips should follow the colour now on screen.
  const hue = isCustom ? heldHue ?? seed.h : seed.h

  const chromaCeiling = useMemo(() => maxChroma(PICKED_LIGHTNESS, hue), [hue])
  const chroma = Math.min(seed.c, chromaCeiling)

  const [draftHex, setDraftHex] = useState<string | null>(null)
  const currentHex = accentHexFor(hue, chroma)

  const hueAt = useMemo(() => (fraction: number) => hueColor(fraction * 360), [])

  const chromaAt = useMemo(
    () => (fraction: number) => rgbToHex(oklchToRgb({ l: PICKED_LIGHTNESS, c: fraction * chromaCeiling, h: hue })),
    [chromaCeiling, hue],
  )

  const commitHex = (text: string) => {
    const rgb = hexToRgb(text)
    // Snap the field back to the live accent, so an unparseable entry cannot
    // leave the input claiming a colour the app is not using.
    setDraftHex(null)
    if (!rgb) return
    // Stored at the picker's own lightness rather than verbatim. Only the hue
    // and chroma of an entered colour survive into the ramp, so keeping the
    // original spelling would leave the field showing a colour the UI never
    // uses - and the strips disagreeing with the text.
    const entered = rgbToOklch(rgb)
    setHeldHue(entered.h)
    onChange(accentHexFor(entered.h, Math.min(entered.c, maxChroma(PICKED_LIGHTNESS, entered.h))))
  }

  return (
    <View className="mt-3 gap-3 rounded-2xl border border-line bg-inset p-3">
      <Strip
        label={t('settings.experience.accentHue')}
        colorAt={hueAt}
        fraction={hue / 360}
        onPick={(fraction) => {
          const picked = fraction * 360
          setHeldHue(picked)
          onChange(accentHexFor(picked, Math.min(chroma, maxChroma(PICKED_LIGHTNESS, picked))))
        }}
      />
      <Strip
        label={t('settings.experience.accentIntensity')}
        colorAt={chromaAt}
        fraction={chromaCeiling === 0 ? 0 : chroma / chromaCeiling}
        onPick={(fraction) => {
          setHeldHue(hue)
          onChange(accentHexFor(hue, fraction * chromaCeiling))
        }}
      />
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-full border border-line" style={{ backgroundColor: currentHex }} />
        <TextInput
          value={draftHex ?? currentHex}
          onChangeText={setDraftHex}
          // Only an edited draft commits. Committing the displayed value would
          // turn a focus-and-dismiss into a colour change, since a preset would
          // be rewritten as the custom accent nearest to it.
          onBlur={() => (draftHex === null ? undefined : commitHex(draftHex))}
          onSubmitEditing={() => (draftHex === null ? undefined : commitHex(draftHex))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel={t('settings.experience.accentHex')}
          placeholder="#000000"
          placeholderTextColor={themeColors.contentSubtle}
          className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-content"
        />
      </View>
      <NoriText className="text-xs leading-4 text-content-muted">
        {t('settings.experience.accentCustomHint')}
      </NoriText>
    </View>
  )
}
