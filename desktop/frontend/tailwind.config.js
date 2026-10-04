const { fontSize, lineHeight } = require('../../lib/web-typography')
const { colors } = require('../../lib/design-tokens')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx,css}',
    '../../extension/components/**/*.{ts,tsx}',
    '../../components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    fontSize,
    lineHeight,
    extend: {
      colors,
      boxShadow: { panel: '0 18px 60px rgba(28,25,23,.12)' },
    },
  },
  plugins: [],
}
