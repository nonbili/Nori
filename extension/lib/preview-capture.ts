import { browser } from 'wxt/browser'
import { setPreviewCapture } from 'nori-root/lib/bookmark-preview'

// Capture the user's visible page, without opening or switching their tabs.
export function installPreviewCapture() {
  setPreviewCapture(async (url) => {
    const tabs = browser.tabs as typeof browser.tabs & { captureVisibleTab?: (windowId?: number, options?: { format: 'jpeg'; quality: number }) => Promise<string> }
    const [tab] = await tabs.query({ active: true, currentWindow: true })
    if (!tab?.url || new URL(tab.url).href !== new URL(url).href || !tabs.captureVisibleTab) {
      throw new Error('preview_open_bookmarked_page')
    }
    const image = await tabs.captureVisibleTab(undefined, { format: 'jpeg', quality: 75 })
    // Do not attach another page's screenshot if the user navigated mid-capture.
    const [current] = await tabs.query({ active: true, currentWindow: true })
    if (current?.url !== tab.url || current?.id !== tab.id) throw new Error('preview_tab_changed')
    return image
  })
}
