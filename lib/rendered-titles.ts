let supported = false

/**
 * Whether this web shell can render a page to read its title. The desktop app
 * can, through a headless browser, and says so at startup; the extension has
 * nothing to render with. The Expo app uses rendered-titles.native.ts.
 */
export const canLoadPagesForTitles = () => supported

export function setRenderedTitlesSupported(value: boolean) {
  supported = value
}
