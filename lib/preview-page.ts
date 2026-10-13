/**
 * The live page behind "Capture preview". The mobile app shows it in a WebView;
 * a host without one (desktop) installs a driver that renders the page elsewhere
 * and streams it into the sheet.
 */
export interface PreviewPageRead {
  title: string
  description: string
  imageUrl: string
}

export interface PreviewPageViewHandle {
  reload(): void
  read(): Promise<PreviewPageRead>
  /** What the page is showing, as an image uri. */
  capture(): Promise<string>
}

export interface PreviewPageViewProps {
  url: string
  onLoadStart: () => void
  onLoadEnd: () => void
  onError: (message: string) => void
}

/** A mouse or key event, named as the DevTools protocol names them. */
export interface PreviewPageInput {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel' | 'keyDown' | 'keyUp'
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  button?: 'none' | 'left' | 'middle' | 'right'
  buttons?: number
  clickCount?: number
  modifiers?: number
  key?: string
  code?: string
  text?: string
  keyCode?: number
}

export interface PreviewPageSession extends PreviewPageViewHandle {
  input(event: PreviewPageInput): void
  resize(width: number, height: number): void
  close(): void
}

export type PreviewPageDriver = (
  url: string,
  size: { width: number; height: number },
  onFrame: (frame: { image?: string; loading: boolean }) => void,
) => Promise<PreviewPageSession>

let driver: PreviewPageDriver | undefined
export function setPreviewPageDriver(value: PreviewPageDriver) {
  driver = value
}
export function previewPageDriver() {
  return driver
}
