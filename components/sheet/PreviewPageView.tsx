import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  previewPageDriver,
  type PreviewPageInput,
  type PreviewPageSession,
  type PreviewPageViewHandle,
  type PreviewPageViewProps,
} from '@/lib/preview-page'

const BUTTONS = ['left', 'middle', 'right'] as const
// A page is not laid out any smaller than this. A smaller box shows it scaled down instead.
const MIN_WIDTH = 240
const MIN_HEIGHT = 160

function modifiers(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
}

/**
 * The bookmark's page as the host's driver renders it: there is no WebView here, so the page lives
 * elsewhere, its frames are drawn in this box and the mouse and keys used on the box are sent back.
 * The page is laid out at the box's own size, or at a larger one of the same shape when the box is
 * too small to lay a page out in, and a point in the box is scaled to the point it shows.
 */
export const PreviewPageView = forwardRef<PreviewPageViewHandle, PreviewPageViewProps>(
  ({ url, onLoadStart, onLoadEnd, onError }, ref) => {
    const box = useRef<HTMLDivElement>(null)
    const [image, setImage] = useState('')
    const [sized, setSized] = useState(false)
    const size = useRef({ width: 0, height: 0 })
    const session = useRef<Promise<PreviewPageSession> | null>(null)
    const callbacks = useRef({ onLoadStart, onLoadEnd, onError })
    callbacks.current = { onLoadStart, onLoadEnd, onError }

    const opened = () => session.current ?? Promise.reject(new Error('preview_page_closed'))
    const send = (event: PreviewPageInput) => void opened().then((page) => page.input(event), () => {})

    useImperativeHandle(
      ref,
      () => ({
        reload: () => void opened().then((page) => page.reload(), () => {}),
        read: () => opened().then((page) => page.read()),
        capture: () => opened().then((page) => page.capture()),
      }),
      [],
    )

    useEffect(() => {
      const element = box.current
      if (!element) return
      let timer: ReturnType<typeof setTimeout> | undefined
      const observer = new ResizeObserver(() => {
        if (!element.clientWidth || !element.clientHeight) return
        const scale = Math.max(1, MIN_WIDTH / element.clientWidth, MIN_HEIGHT / element.clientHeight)
        const next = { width: Math.round(element.clientWidth * scale), height: Math.round(element.clientHeight * scale) }
        if (next.width === size.current.width && next.height === size.current.height) return
        size.current = next
        setSized(true)
        // The window is resized in many small steps; the page is laid out again for the last.
        clearTimeout(timer)
        timer = setTimeout(() => void opened().then((page) => page.resize(next.width, next.height), () => {}), 200)
      })
      observer.observe(element)
      return () => {
        clearTimeout(timer)
        observer.disconnect()
      }
    }, [])

    useEffect(() => {
      const open = previewPageDriver()
      if (!sized || !open) return
      let closed = false
      let loading = true
      setImage('')
      callbacks.current.onLoadStart()
      const page = open(url, size.current, (frame) => {
        if (closed) return
        if (frame.image) setImage(frame.image)
        if (frame.loading === loading) return
        loading = frame.loading
        if (loading) callbacks.current.onLoadStart()
        else callbacks.current.onLoadEnd()
      })
      session.current = page
      page.catch((error) => {
        if (closed) return
        callbacks.current.onLoadEnd()
        callbacks.current.onError(error instanceof Error ? error.message : String(error))
      })
      return () => {
        closed = true
        if (session.current === page) session.current = null
        void page.then((opened) => opened.close(), () => {})
      }
    }, [url, sized])

    // Movement and scrolling arrive faster than they are worth sending: one of each per frame.
    const pending = useRef<{ move?: PreviewPageInput; wheel?: PreviewPageInput; frame?: number }>({})
    const flush = () => {
      const { move, wheel } = pending.current
      pending.current = {}
      if (move) send(move)
      if (wheel) send(wheel)
    }
    const schedule = () => {
      pending.current.frame ??= requestAnimationFrame(flush)
    }
    useEffect(() => () => cancelAnimationFrame(pending.current.frame ?? 0), [])

    const point = (event: { clientX: number; clientY: number }) => {
      const rect = box.current!.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) * size.current.width) / (rect.width || 1),
        y: ((event.clientY - rect.top) * size.current.height) / (rect.height || 1),
      }
    }
    const mouse = (type: 'mousePressed' | 'mouseReleased', event: MouseEvent | ReactMouseEvent) => {
      flush()
      send({
        type,
        ...point(event),
        button: BUTTONS[event.button] ?? 'none',
        buttons: event.buttons,
        clickCount: event.detail || 1,
        modifiers: modifiers(event),
      })
    }
    const key = (type: 'keyDown' | 'keyUp', event: KeyboardEvent) => {
      // Escape stays with the sheet, which closes on it.
      if (event.key === 'Escape') return
      event.preventDefault()
      const typed = event.ctrlKey || event.metaKey ? '' : event.key === 'Enter' ? '\r' : event.key.length === 1 ? event.key : ''
      send({ type, key: event.key, code: event.code, keyCode: event.keyCode, text: typed, modifiers: modifiers(event) })
    }

    return (
      <div
        ref={box}
        tabIndex={0}
        style={{ flex: 1, minHeight: 0, outline: 'none', background: '#fff', cursor: 'default', userSelect: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          // Keeps the image from being dragged, which also keeps the box from taking focus itself.
          event.preventDefault()
          box.current?.focus()
          mouse('mousePressed', event)
          // The button may be let go outside the box, and the page still has to hear of it.
          window.addEventListener('mouseup', (up) => mouse('mouseReleased', up), { once: true })
        }}
        onMouseMove={(event) => {
          pending.current.move = { type: 'mouseMoved', ...point(event), buttons: event.buttons, modifiers: modifiers(event) }
          schedule()
        }}
        onWheel={(event) => {
          const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? size.current.height : 1
          const last = pending.current.wheel
          pending.current.wheel = {
            type: 'mouseWheel',
            ...point(event),
            deltaX: (last?.deltaX ?? 0) + event.deltaX * unit,
            deltaY: (last?.deltaY ?? 0) + event.deltaY * unit,
            modifiers: modifiers(event),
          }
          schedule()
        }}
        onKeyDown={(event) => key('keyDown', event)}
        onKeyUp={(event) => key('keyUp', event)}
      >
        {image ? (
          <img src={image} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%' }} />
        ) : null}
      </div>
    )
  },
)
PreviewPageView.displayName = 'PreviewPageView'

/** Blocking ads needs the app's own WebView. */
export const PreviewPageOptions: React.FC<{ onChanged: () => void }> = () => null
