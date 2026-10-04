/** Android's RAW capture contains width:height| followed by RGBA pixels. */
export function isBlankPreviewCapture(raw: string) {
  const header = /^(\d+):(\d+)\|/.exec(raw)
  if (!header) throw new Error('invalid_preview_pixels')
  const width = Number(header[1]),
    height = Number(header[2])
  const pixels = raw.slice(header[0].length)
  const padding = pixels.endsWith('==') ? 2 : pixels.endsWith('=') ? 1 : 0
  if (!width || !height || (pixels.length * 3) / 4 - padding !== width * height * 4)
    throw new Error('invalid_preview_pixels')
  // Inspect the interior: edge pixels can contain WebView/compositor artifacts.
  // Quantize RGB and ignore alpha so a stray first pixel or alpha differences
  // cannot make an otherwise blank white image appear to contain page content.
  const border = width > 2 && height > 2 ? 1 : 0
  const colors = new Map<number, number>()
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)))
  let total = 0,
    largest = 0
  for (let y = border; y < height - border; y += step) {
    for (let x = border; x < width - border; x += step) {
      const index = (y * width + x) * 4
      // Decode only the sampled pixels instead of allocating/decoding the
      // entire full-resolution frame on the JS thread.
      const offset = Math.floor(index / 3) * 4
      const sample = atob(pixels.slice(offset, offset + 8))
      const channel = index % 3
      const color =
        ((sample.charCodeAt(channel) >> 4) << 8) |
        ((sample.charCodeAt(channel + 1) >> 4) << 4) |
        (sample.charCodeAt(channel + 2) >> 4)
      const count = (colors.get(color) || 0) + 1
      colors.set(color, count)
      largest = Math.max(largest, count)
      total++
    }
  }
  return largest / total >= 0.999
}
