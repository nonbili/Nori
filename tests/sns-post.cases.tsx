import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import { act, type ReactNode } from 'react'
import { normalizeRichText, type Entity } from '../lib/sns-schema'
import type { SocialPost } from '../lib/social-post'

const win = new Window({ url: 'https://nori.test' })
Object.assign(globalThis, { window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const previews = new Map<string, string>()
const openUrl = mock()
mock.module('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pressable: ({ children, onPress }: { children: ReactNode; onPress: (event: unknown) => void }) => <button onClick={onPress}>{children}</button>,
}))
mock.module('expo-image', () => ({ Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} /> }))
mock.module('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }))
mock.module('@/components/common/NoriText', () => ({ NoriText: ({ children, className, onPress }: {
  children: ReactNode; className?: string; onPress?: (event: unknown) => void
}) => <span className={className} onClick={onPress}>{children}</span> }))
mock.module('@/lib/social-post-autosave', () => ({ localCaptureOwner$: { get: () => '', peek: () => '', onChange: () => () => {} } }))
mock.module('@/lib/bookmark-preview-storage', () => ({
  readPreview: async (key: string) => ({ imageUri: previews.get(key) }),
  peekPreview: async (key: string) => ({ imageUri: previews.get(key) }),
}))
mock.module('@/lib/bookmark-preview', () => ({ onPreviewChange: () => () => {} }))
mock.module('@/lib/saved-social-post', () => ({ readSavedPost: async () => undefined }))
mock.module('@/lib/open-url', () => ({ openUrl }))
mock.module('@/lib/theme', () => ({ useThemeColors: () => ({ content: '#000' }) }))
mock.module('@react-native-vector-icons/material-icons', () => ({ default: () => null }))
mock.module('@/components/bookmark/SocialMediaGallery', () => ({ SocialMediaGallery: ({ index, onChange }: { index?: number; onChange: (index: number) => void }) =>
  index === undefined ? null : <section data-gallery={index}><b onClick={() => onChange(index + 1)} /></section> }))
mock.module('@/components/bookmark/Favicon', () => ({ Favicon: ({ pageUrl }: { pageUrl?: string }) => <i data-favicon={pageUrl} /> }))
const { createRoot } = await import('react-dom/client')
const { SavedSocialPost } = await import('../components/bookmark/SavedSocialPost')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); previews.clear(); openUrl.mockClear() })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const post = (): SocialPost => ({ site: 'future-provider', url: 'https://social.test/post/1', author: 'Alice', text: '', media: [] })
async function mount(value: SocialPost, parentPress = () => {}) {
  await act(async () => root.render(<div onClick={parentPress}><SavedSocialPost post={value} /></div>))
  await act(async () => { await Promise.resolve() })
}
test('renders overlapping formatting safely and opens an entity link only on an explicit press', async () => {
  const value = post()
  value.richText = normalizeRichText('🌏 hello <script>', [
    { type: 'bold', start: 0, end: 8 }, { type: 'italic', start: 3, end: 8 },
    { type: 'link', start: 3, end: 8, url: 'https://example.com' },
  ])
  const parentPress = mock()
  await mount(value, parentPress)
  expect(container.textContent).toContain('🌏 hello <script>')
  expect(container.querySelector('script')).toBeNull()
  const link = [...container.querySelectorAll('span')].find((node) => node.textContent === 'hello')!
  expect(link.className).toContain('font-bold')
  expect(link.className).toContain('italic')
  expect(openUrl).not.toHaveBeenCalled()
  await act(async () => { link.click() })
  expect(openUrl).toHaveBeenCalledWith('https://example.com')
  expect(parentPress).not.toHaveBeenCalled()
})
test('keeps spoilers hidden until pressed and ignores extension metadata as navigation', async () => {
  const value = post()
  value.richText = normalizeRichText('secret plain', [
    { type: 'spoiler', start: 0, end: 6 },
    { type: 'extension', name: 'future:mark', start: 7, end: 12, url: 'https://ignored.example' } as Entity,
  ])
  await mount(value)
  expect(container.textContent).not.toContain('secret')
  const hidden = [...container.querySelectorAll('span')].find((node) => node.textContent === '▇▇▇▇▇▇')!
  await act(async () => { hidden.click() })
  expect(container.textContent).toContain('secret')
  const plain = [...container.querySelectorAll('span')].find((node) => node.textContent === 'plain')!
  await act(async () => { plain.click() })
  expect(openUrl).not.toHaveBeenCalled()
})
test('shows link cards and related posts using only cached image URIs', async () => {
  const value = post()
  value.title = normalizeRichText('Post title')
  value.contentWarning = normalizeRichText('Warning')
  value.links = [{ url: 'https://card.example', title: 'Card', description: 'Description',
    thumbnail: { type: 'image', url: 'https://remote.example/never-fetch', cacheKey: 'card' } }]
  value.relations = [{ type: 'crosspost', target: { provider: 'reddit', id: '2' }, state: 'available', post: { ...post(), text: 'Nested post' } }]
  previews.set('card', 'data:image/png;base64,AQID')
  const parentPress = mock()
  await mount(value, parentPress)
  expect(container.textContent).toContain('Warning')
  expect(container.textContent).not.toContain('Nested post')
  expect(container.querySelector('img')).toBeNull()
  await act(async () => { container.querySelector('button')!.click() })
  expect(parentPress).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Post title')
  expect(container.textContent).toContain('Warning')
  expect(container.textContent).toContain('Nested post')
  expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AQID')
  expect(openUrl).not.toHaveBeenCalled()
})

test('shows the provider as the post URL favicon', async () => {
  await mount(post())
  expect(container.querySelector('[data-favicon]')?.getAttribute('data-favicon')).toBe('https://social.test/post/1')
})

test('sensitive content stays collapsed even without warning text', async () => {
  const value = post()
  value.sensitive = true
  value.text = 'Sensitive body'
  value.media = [{ type: 'image', url: 'https://remote.example', cacheKey: 'sensitive' }]
  previews.set('sensitive', 'data:image/png;base64,AQID')
  await mount(value)
  expect(container.textContent).not.toContain('Sensitive body')
  expect(container.querySelector('img')).toBeNull()
  await act(async () => { container.querySelector('button')!.click() })
  await act(async () => { await Promise.resolve() })
  expect(container.textContent).toContain('Sensitive body')
  expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AQID')
})

test('pressing a post image opens the gallery at that image without opening the post', async () => {
  const value = post()
  value.media = [{ type: 'image', url: 'https://remote.example/1', cacheKey: 'one' }, { type: 'image', url: 'https://remote.example/2', cacheKey: 'two' }]
  previews.set('one', 'data:image/png;base64,AQ')
  previews.set('two', 'data:image/png;base64,Ag')
  const parentPress = mock()
  await mount(value, parentPress)
  expect(container.querySelector('[data-gallery]')).toBeNull()
  await act(async () => { container.querySelectorAll('img')[1].click() })
  expect(container.querySelector('[data-gallery]')?.getAttribute('data-gallery')).toBe('1')
  expect(parentPress).not.toHaveBeenCalled()
})
