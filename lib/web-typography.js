/** Web text sizes scale independently of spacing and icon dimensions. */
const { fontSize: defaults } = require('tailwindcss/defaultTheme')
const scaled = (value) => (/^\d+(\.\d+)?$/.test(value) ? value : `calc(${value} * var(--nori-font-scale, 1))`)
module.exports.fontSize = {
  ...Object.fromEntries(
    Object.entries(defaults).map(([name, [size, options]]) => [
      name,
      [scaled(size), { ...options, lineHeight: scaled(options.lineHeight) }],
    ]),
  ),
  // Unsized react-native-web text uses 14px and normal line height.
  'nori-default': [scaled('14px'), {}],
  '2xs': [scaled('10px'), { lineHeight: scaled('14px') }],
  tiny: [scaled('11px'), { lineHeight: scaled('16px') }],
}
module.exports.lineHeight = Object.fromEntries(
  Object.entries(require('tailwindcss/defaultTheme').lineHeight).map(([name, value]) => [
    name,
    // Unitless line heights already follow the scaled font size.
    /^\d+(\.\d+)?$/.test(value) ? value : scaled(value),
  ]),
)
