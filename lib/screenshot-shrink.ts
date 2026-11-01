import { SCREENSHOT_QUALITY, SCREENSHOT_WIDTH } from './screenshot-sync'

// Runs in the extension's service worker too, so it cannot use the DOM.
export async function shrinkScreenshot(imageUri: string) {
  const source = await (await fetch(imageUri)).blob()
  const bitmap = await createImageBitmap(source)
  const width = Math.min(bitmap.width, SCREENSHOT_WIDTH)
  const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('screenshot_shrink_failed')
  // JPEG has no alpha, and a page's transparent background would turn black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: SCREENSHOT_QUALITY })
  return new Uint8Array(await blob.arrayBuffer())
}
