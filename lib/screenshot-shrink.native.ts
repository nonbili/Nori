import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { base64ToBytes, SCREENSHOT_QUALITY, SCREENSHOT_WIDTH } from './screenshot-sync'

export async function shrinkScreenshot(imageUri: string) {
  const context = ImageManipulator.manipulate(imageUri)
  context.resize({ width: SCREENSHOT_WIDTH })
  const image = await context.renderAsync()
  try {
    const { base64 } = await image.saveAsync({ format: SaveFormat.JPEG, compress: SCREENSHOT_QUALITY, base64: true })
    if (!base64) throw new Error('screenshot_shrink_failed')
    return base64ToBytes(base64)
  } finally {
    image.release()
    context.release()
  }
}
