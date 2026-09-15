import { Platform } from 'react-native'

/** Breathing room between the status bar and the topmost element of a screen.
 *  The extension and desktop have no status bar inset to lean on, so they match
 *  the screen's horizontal padding instead. */
export const SCREEN_TOP_OFFSET = Platform.OS === 'web' ? 24 : 8
