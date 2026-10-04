const { colors } = require('./lib/design-tokens')
const typography =
  process.env.NATIVEWIND_OS && process.env.NATIVEWIND_OS !== 'web'
    ? { fontSize: { '2xs': ['10px', '14px'], tiny: ['11px', '16px'] } }
    : require('./lib/web-typography')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: { colors, ...typography },
  },
  plugins: [],
};
