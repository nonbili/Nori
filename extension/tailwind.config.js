/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './entrypoints/**/*.{html,ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: { nori: { 50: '#ecfdf5', 500: '#10b981', 600: '#059669', 700: '#047857', 950: '#022c22' } },
      boxShadow: { panel: '0 18px 60px rgba(28,25,23,.12)' },
    },
  },
  plugins: [],
}
