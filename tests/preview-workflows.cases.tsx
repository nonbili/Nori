import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { Window } from 'happy-dom'
import { act, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { observable } from '@legendapp/state'
import type { BookmarkEditorState } from '../states/ui'
import type { PreviewPageRead, PreviewPageViewHandle, PreviewPageViewProps } from '../lib/preview-page'
import type { PreviewSource } from '../lib/bookmark-preview-types'

const window = new Window({ url: 'https://nori.test' })
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})

// Render the sheets' real React logic, replacing only native views and host services.
// NativeWind layout, gestures and the browser engine itself belong to device tests.
type ViewProps = {
  children?: ReactNode
  ref?: any
  onPress?: () => void
  disabled?: boolean
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityState?: { selected?: boolean; expanded?: boolean }
}
const View = ({ children, ref }: ViewProps) => <div ref={ref}>{children}</div>
const Pressable = ({ children, ref, onPress, disabled, accessibilityRole, accessibilityLabel, accessibilityState }: ViewProps) => (
  <button ref={ref} onClick={onPress} disabled={disabled} role={accessibilityRole}
    aria-label={accessibilityLabel} aria-checked={accessibilityState?.selected}
    aria-expanded={accessibilityState?.expanded}>{children}</button>
)
const Text = ({ children }: ViewProps) => <span>{children}</span>
const TextInput = ({ value, placeholder, onChangeText, ref }: {
  value: string; placeholder: string; onChangeText: (value: string) => void; ref?: any
}) => <input ref={ref} value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />

mock.module('react-native', () => ({
  Platform: { OS: 'web' }, View, Pressable, TextInput, ScrollView: View,
  ActivityIndicator: () => <span>Loading</span>,
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 1000, height: 800 }),
}))
mock.module('expo-image', () => ({ Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="Preview" /> }))
mock.module('react-native-mmkv', () => ({ createMMKV: () => {
  const values = new Map<string, number>()
  return { getNumber: (key: string) => values.get(key), set: (key: string, value: number) => values.set(key, value) }
} }))
mock.module('@react-native-vector-icons/material-icons', () => ({ default: () => null }))
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
mock.module('@/components/common/NoriText', () => ({ NoriText: Text, NoriTextInput: TextInput }))
mock.module('@/components/bookmark/Favicon', () => ({ Favicon: () => null }))
mock.module('@/components/sheet/TagSuggestionMenu', () => ({ TagSuggestionMenu: () => null }))
mock.module('@/lib/theme', () => ({ useThemeColors: () => ({}) }))
mock.module('@/lib/toast', () => ({ showToast: mock() }))
mock.module('@/lib/rendered-titles', () => ({ canLoadPagesForTitles: () => false }))
mock.module('@/lib/saved-bookmark-metadata', () => ({ enrichSavedBookmark: mock() }))
const applyRenderedTitle = mock()
mock.module('@/lib/title-backfill', () => ({ applyRenderedTitle }))

const ui$ = observable({
  bookmarkEditor: null as BookmarkEditorState | null,
  previewPage: null as { id: string; url: string; previewSource?: unknown; fromEditor?: boolean } | null,
})
const settings$ = observable({
  previewImageSource: 'page-image' as PreviewSource,
  bookmarkView: 'preview',
  loadPagesForTitles: false,
  editorPreviewOpen: false,
  setLastSelectedListId: mock(),
})
const add = mock((_bookmark: BookmarkEditorState) => 'saved-id')
const update = mock()
mock.module('@/states/ui', () => ({ ui$ }))
mock.module('@/states/settings', () => ({ settings$ }))
mock.module('@/states/bookmarks', () => ({ bookmarks$: { bookmarks: observable([]), add, update } }))
mock.module('@/states/lists', () => ({ lists$: { lists: observable([]) } }))
const Modal = ({ children, onClose }: { children: ReactNode; onClose: () => void }) => (
  <section><button onClick={onClose}>Close sheet</button>{children}</section>
)
mock.module('@/components/modal/BaseModal', () => ({ FullScreenModal: Modal }))
mock.module('@/components/modal/BaseCenterModal', () => ({ BaseCenterModal: Modal }))

let metadata: PreviewPageRead
const read = mock(async () => metadata)
const capture = mock(async () => 'data:image/png;base64,c2hvdA==')
const release = mock()
mock.module('@/components/sheet/PreviewPageView', () => ({
  PreviewPageView: ({ ref, onLoadStart, onLoadEnd }: PreviewPageViewProps & { ref: any }) => {
    useImperativeHandle(ref, (): PreviewPageViewHandle => ({ read, capture, release, reload() {} }), [])
    const initialLoad = useRef({ onLoadStart, onLoadEnd })
    useEffect(() => { initialLoad.current.onLoadStart(); initialLoad.current.onLoadEnd() }, [])
    return <div>Live page</div>
  },
  PreviewPageOptions: () => null,
}))

// Import after installing the native adapters; the preview cache and source logic stay real.
const { createRoot } = await import('react-dom/client')
const { BookmarkEditorSheet } = await import('../components/sheet/BookmarkEditorSheet')
const { PreviewPageSheet } = await import('../components/sheet/PreviewPageSheet')
const { PreviewSettings } = await import('../components/bookmark/PreviewSettings')
const preview = await import('../lib/bookmark-preview')
const { previewKey } = await import('../lib/bookmark-preview-types')
const { readPreview, writePreview } = await import('../lib/bookmark-preview-storage')
const { setPageFetch } = await import('../lib/bookmark')
const { setPreviewPageDriver } = await import('../lib/preview-page')

const container = document.createElement('div')
document.body.append(container)
let root: ReturnType<typeof createRoot>
let url: string
let sequence = 0
const imageFetch = mock(async () => 'data:image/jpeg;base64,Y292ZXI=')
const pageFetch = mock(async () => new Response('<meta name="description" content="Fetched">'))

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((element) =>
    element.getAttribute('aria-label') === label || element.textContent === label)
  if (!found) throw new Error(`Missing button: ${label}\n${container.textContent}`)
  return found as unknown as HTMLButtonElement
}
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}
async function click(label: string) {
  await act(async () => { button(label).click() })
  await flush()
}
async function mount(children: ReactNode = <><BookmarkEditorSheet /><PreviewPageSheet /></>) {
  await act(async () => { root.render(children) })
  await flush()
}
async function openCapture() {
  await click('preview.imageSourcepreview.default · preview.page-image')
  await click('preview.capturePreview')
}

beforeEach(async () => {
  url = `https://article.example/${++sequence}`
  metadata = { title: 'Page title', description: 'Page description', imageUrl: 'https://article.example/cover.jpg' }
  read.mockReset(); read.mockImplementation(async () => metadata)
  capture.mockReset(); capture.mockImplementation(async () => 'data:image/png;base64,c2hvdA==')
  for (const fn of [release, add, update, applyRenderedTitle, imageFetch, pageFetch]) fn.mockClear()
  settings$.previewImageSource.set('page-image')
  settings$.editorPreviewOpen.set(false)
  ui$.previewPage.set(null)
  ui$.bookmarkEditor.set({ url, title: 'Unsaved title', icon: 'custom-icon', listId: 'my-list', tags: ['reading'], note: 'Unsaved note' })
  preview.setPreviewImageFetch(imageFetch)
  setPageFetch(pageFetch)
  setPreviewPageDriver(async () => { throw new Error('The host view is replaced in this test') })
  await preview.updatePreviewBookmarks([])
  root = createRoot(container as unknown as HTMLElement)
})
afterEach(async () => {
  await act(async () => root.unmount())
  await preview.updatePreviewBookmarks([])
})

describe('editor capture round trip', () => {
  test('preserves unsaved fields, applies the screenshot to the editor, and saves that choice', async () => {
    await mount()
    const original = structuredClone(ui$.bookmarkEditor.peek()!)
    await openCapture()
    expect(container.textContent).not.toContain('bookmarks.add')
    expect(add).not.toHaveBeenCalled()
    await click('preview.screenshot')
    await click('preview.capture')
    expect(ui$.previewPage.peek()).toBeNull()
    expect(ui$.bookmarkEditor.peek()).toEqual({ ...original, previewSource: 'screenshot' })
    expect(container.textContent).toContain('bookmarks.add')
    expect(button('preview.refresh').disabled).toBe(false) // Controls remain expanded after returning.
    expect(settings$.previewImageSource.peek()).toBe('page-image')
    expect(update).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledWith('data:image/png;base64,c2hvdA==')
    expect(await readPreview(previewKey(url, 'screenshot'))).toMatchObject({ imageUri: 'data:image/png;base64,c2hvdA==' })
    await click('bookmarks.save')
    expect(add).toHaveBeenCalledWith({ ...original, previewSource: 'screenshot' })
  })

  test('cancelling capture returns to the untouched editor', async () => {
    await mount()
    const original = structuredClone(ui$.bookmarkEditor.peek())
    await openCapture()
    await click('Close sheet')
    expect(ui$.bookmarkEditor.peek()).toEqual(original)
    expect(button('preview.refresh').disabled).toBe(false)
    expect(capture).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test('the image controls open the next bookmark as they were left', async () => {
    await mount()
    expect(container.textContent).not.toContain('preview.capturePreview')
    await click('preview.imageSourcepreview.default · preview.page-image')
    await click('bookmarks.cancel')
    await act(async () => ui$.bookmarkEditor.set({ url: `${url}/next`, title: '', icon: '', listId: 'my-list', tags: [], note: '' }))
    await flush()
    expect(button('preview.capturePreview').disabled).toBe(false)
    await click('preview.imageSourcepreview.default · preview.page-image')
    expect(container.textContent).not.toContain('preview.capturePreview')
  })

  test.each(['', 'Written by me', '   '])('fills only an empty title (%j)', async (title) => {
    ui$.bookmarkEditor.title.set(title)
    await mount()
    await openCapture()
    await click('preview.capture')
    expect(ui$.bookmarkEditor.title.peek()).toBe(title.trim() ? title : metadata.title)
  })

  test('does not replace an empty editor title with a hostname placeholder', async () => {
    ui$.bookmarkEditor.title.set('')
    metadata.title = 'article.example'
    await mount()
    await openCapture()
    await click('preview.capture')
    expect(ui$.bookmarkEditor.title.peek()).toBe('')
  })
})

describe('capture errors and cleanup', () => {
  test('captures before reading metadata and saves the screenshot if reading fails', async () => {
    await mount()
    await openCapture()
    await click('preview.screenshot')
    const order: string[] = []
    capture.mockImplementation(async () => { order.push('capture'); return 'data:image/png;base64,c2hvdA==' })
    read.mockImplementation(async () => { order.push('read'); throw new Error('Metadata unavailable') })
    await click('preview.capture')
    expect(order).toEqual(['capture', 'read'])
    expect(await readPreview(previewKey(url, 'screenshot'))).toMatchObject({ imageUri: 'data:image/png;base64,c2hvdA==', description: '' })
    expect(ui$.previewPage.peek()).toBeNull()
    expect(ui$.bookmarkEditor.title.peek()).toBe('Unsaved title')
    expect(release).toHaveBeenCalledTimes(1)
  })

  test('a capture failure leaves the sheet open and allows a successful retry', async () => {
    await mount()
    await openCapture()
    await click('preview.screenshot')
    capture.mockRejectedValueOnce(new Error('Capture failed'))
    await click('preview.capture')
    expect(container.textContent).toContain('Capture failed')
    expect(ui$.previewPage.peek()).not.toBeNull()
    expect(button('preview.capture').disabled).toBe(false)
    expect(release).not.toHaveBeenCalled()
    await click('preview.capture')
    expect(ui$.previewPage.peek()).toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
  })

  test('a save failure releases the capture, preserves editor edits and permits retry', async () => {
    await mount()
    await openCapture()
    await click('preview.screenshot')
    const original = structuredClone(ui$.bookmarkEditor.peek())
    const save = spyOn(preview, 'saveRenderedPreview').mockRejectedValueOnce(new Error('Disk full'))
    try {
      await click('preview.capture')
      expect(container.textContent).toContain('Disk full')
      expect(ui$.previewPage.peek()).not.toBeNull()
      expect(ui$.bookmarkEditor.peek()).toEqual(original)
      expect(release).toHaveBeenCalledTimes(1)
      expect(button('preview.capture').disabled).toBe(false)
    } finally { save.mockRestore() }
    await click('preview.capture')
    expect(ui$.previewPage.peek()).toBeNull()
    expect(release).toHaveBeenCalledTimes(2)
  })

  test('a cover metadata failure leaves the sheet open without capturing a screenshot', async () => {
    await mount()
    await openCapture()
    read.mockRejectedValueOnce(new Error('Cannot read cover'))
    await click('preview.capture')
    expect(container.textContent).toContain('Cannot read cover')
    expect(ui$.previewPage.peek()).not.toBeNull()
    expect(capture).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
    await click('preview.capture')
    expect(ui$.previewPage.peek()).toBeNull()
  })

  test('disables capture while saving and releases the image only after the save finishes', async () => {
    await mount()
    await openCapture()
    await click('preview.screenshot')
    let finish!: () => void
    const saving = new Promise<void>((resolve) => { finish = resolve })
    const save = spyOn(preview, 'saveRenderedPreview').mockImplementationOnce(() => saving)
    try {
      await click('preview.capture')
      expect(button('preview.capturing').disabled).toBe(true)
      expect(release).not.toHaveBeenCalled()
      await act(async () => { finish(); await saving })
      expect(ui$.previewPage.peek()).toBeNull()
      expect(release).toHaveBeenCalledTimes(1)
    } finally { finish(); save.mockRestore() }
  })
})

describe('no-image default', () => {
  test('settings offer No image and the editor inherits it without fetching or showing cached images', async () => {
    await mount(<PreviewSettings />)
    await click('preview.none')
    expect(settings$.previewImageSource.peek()).toBe('none')
    await preview.updatePreviewBookmarks([url])
    await writePreview(previewKey(url, 'page-image'), { description: 'Saved text', imageUrl: metadata.imageUrl, imageUri: 'data:image/jpeg;base64,Y292ZXI=', savedAt: 1 })
    await mount()
    await click('preview.imageSourcepreview.default · preview.none')
    expect(button('preview.refresh').disabled).toBe(true)
    expect(container.textContent).toContain('Saved text')
    expect(container.textContent).toContain(url)
    expect(container.querySelector('img')).toBeNull()
    expect(pageFetch).not.toHaveBeenCalled()
    expect(imageFetch).not.toHaveBeenCalled()

    await click('preview.page-image')
    expect(settings$.previewImageSource.peek()).toBe('none')
    expect(button('preview.refresh').disabled).toBe(false)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,Y292ZXI=')
    await click('preview.default')
    expect(button('preview.refresh').disabled).toBe(true)
    expect(container.querySelector('img')).toBeNull()
    await click('bookmarks.save')
    expect(add.mock.calls[0][0]).toMatchObject({ previewSource: 'default' })
    expect(settings$.previewImageSource.peek()).toBe('none')
  })

  test('an explicit No image override survives a default change and is saved', async () => {
    ui$.bookmarkEditor.previewSource.set('none')
    await mount()
    await click('preview.imageSourcepreview.none')
    await act(async () => settings$.previewImageSource.set('screenshot'))
    expect(button('preview.refresh').disabled).toBe(true)
    expect(ui$.bookmarkEditor.previewSource.peek()).toBe('none')
    await click('bookmarks.save')
    expect(add.mock.calls[0][0]).toMatchObject({ previewSource: 'none' })
  })

  test('Capture is available with a no-image default and changes only the edited bookmark', async () => {
    settings$.previewImageSource.set('none')
    await mount()
    await click('preview.imageSourcepreview.default · preview.none')
    expect(button('preview.capturePreview').disabled).toBe(false)
    await click('preview.capturePreview')
    // With no image selected, Capture starts from the live page screenshot.
    await click('preview.capture')
    expect(ui$.bookmarkEditor.previewSource.peek()).toBe('screenshot')
    expect(settings$.previewImageSource.peek()).toBe('none')
    expect(update).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledTimes(1)
  })
})
