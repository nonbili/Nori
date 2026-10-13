type UrlOpener = (url: string) => unknown

let opener: UrlOpener = (url) => window.open(url, '_blank', 'noopener')

/**
 * How the web shells open a link is theirs to decide: the extension opens a
 * browser tab and the desktop app hands the URL to the system browser. Each
 * registers its opener at startup, so this module never has to import a shell.
 * The Expo app uses open-url.native.ts instead.
 */
export function setUrlOpener(next: UrlOpener) {
  opener = next
}

export async function openUrl(url: string) {
  await opener(url)
}
