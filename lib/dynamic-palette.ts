import type { SystemPalette } from './system-palette'

// Wallpaper-based dynamic color (Material You) is Android 12+ only.
export const isDynamicColorAvailable = false

export const readSystemPalette = (): SystemPalette | null => null
