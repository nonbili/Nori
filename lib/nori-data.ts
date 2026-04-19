import { getDuckDuckGoIcon } from './bookmark'

export interface RowJsonState {
  visible?: boolean
  sort_index?: number
  deleted_at?: string | null
  [key: string]: unknown
}

export interface BookmarkListData {
  id: string
  name: string
  json: RowJsonState
  createdAt: string
  updatedAt: string
}

export interface BookmarkRecordData {
  id: string
  listId: string
  url: string
  title: string
  icon: string
  json: RowJsonState
  createdAt: string
  updatedAt: string
}

export interface StarterListDefinition {
  id: string
  name: string
}

export interface StarterBookmarkDefinition {
  id: string
  listId: string
  title: string
  url: string
  icon: string
}

const faviconForUrl = (url: string) => getDuckDuckGoIcon(url)

export const STARTER_LISTS: StarterListDefinition[] = [
  { id: 'builtin-sns', name: 'SNS' },
  { id: 'builtin-ai', name: 'AI' },
  { id: 'builtin-news', name: 'News' },
  { id: 'builtin-later', name: 'Later' },
]

export const STARTER_BOOKMARKS: StarterBookmarkDefinition[] = [
  { id: 'builtin-sns-x', listId: 'builtin-sns', title: 'X', url: 'https://x.com', icon: faviconForUrl('https://x.com') },
  {
    id: 'builtin-sns-instagram',
    listId: 'builtin-sns',
    title: 'Instagram',
    url: 'https://www.instagram.com',
    icon: faviconForUrl('https://www.instagram.com'),
  },
  {
    id: 'builtin-sns-threads',
    listId: 'builtin-sns',
    title: 'Threads',
    url: 'https://www.threads.com',
    icon: faviconForUrl('https://www.threads.com'),
  },
  {
    id: 'builtin-sns-reddit',
    listId: 'builtin-sns',
    title: 'Reddit',
    url: 'https://www.reddit.com',
    icon: faviconForUrl('https://www.reddit.com'),
  },
  {
    id: 'builtin-sns-bluesky',
    listId: 'builtin-sns',
    title: 'Bluesky',
    url: 'https://bsky.app',
    icon: faviconForUrl('https://bsky.app'),
  },
  {
    id: 'builtin-sns-tiktok',
    listId: 'builtin-sns',
    title: 'TikTok',
    url: 'https://www.tiktok.com',
    icon: faviconForUrl('https://www.tiktok.com'),
  },
  {
    id: 'builtin-sns-facebook',
    listId: 'builtin-sns',
    title: 'Facebook',
    url: 'https://www.facebook.com',
    icon: faviconForUrl('https://www.facebook.com'),
  },
  {
    id: 'builtin-sns-linkedin',
    listId: 'builtin-sns',
    title: 'LinkedIn',
    url: 'https://www.linkedin.com',
    icon: faviconForUrl('https://www.linkedin.com'),
  },
  {
    id: 'builtin-ai-chatgpt',
    listId: 'builtin-ai',
    title: 'ChatGPT',
    url: 'https://chatgpt.com',
    icon: faviconForUrl('https://chatgpt.com'),
  },
  {
    id: 'builtin-ai-claude',
    listId: 'builtin-ai',
    title: 'Claude',
    url: 'https://claude.ai',
    icon: faviconForUrl('https://claude.ai'),
  },
  {
    id: 'builtin-ai-gemini',
    listId: 'builtin-ai',
    title: 'Gemini',
    url: 'https://gemini.google.com',
    icon: faviconForUrl('https://gemini.google.com'),
  },
  {
    id: 'builtin-ai-perplexity',
    listId: 'builtin-ai',
    title: 'Perplexity',
    url: 'https://www.perplexity.ai',
    icon: faviconForUrl('https://www.perplexity.ai'),
  },
  {
    id: 'builtin-ai-grok',
    listId: 'builtin-ai',
    title: 'Grok',
    url: 'https://grok.com',
    icon: faviconForUrl('https://grok.com'),
  },
  {
    id: 'builtin-ai-poe',
    listId: 'builtin-ai',
    title: 'Poe',
    url: 'https://poe.com',
    icon: faviconForUrl('https://poe.com'),
  },
  {
    id: 'builtin-ai-huggingface',
    listId: 'builtin-ai',
    title: 'Hugging Face',
    url: 'https://huggingface.co',
    icon: faviconForUrl('https://huggingface.co'),
  },
  {
    id: 'builtin-ai-characterai',
    listId: 'builtin-ai',
    title: 'Character.AI',
    url: 'https://character.ai',
    icon: faviconForUrl('https://character.ai'),
  },
  {
    id: 'builtin-news-bbc',
    listId: 'builtin-news',
    title: 'BBC News',
    url: 'https://www.bbc.com/news',
    icon: faviconForUrl('https://www.bbc.com/news'),
  },
  {
    id: 'builtin-news-reuters',
    listId: 'builtin-news',
    title: 'Reuters',
    url: 'https://www.reuters.com',
    icon: faviconForUrl('https://www.reuters.com'),
  },
  {
    id: 'builtin-news-ap',
    listId: 'builtin-news',
    title: 'AP News',
    url: 'https://apnews.com',
    icon: faviconForUrl('https://apnews.com'),
  },
  {
    id: 'builtin-news-npr',
    listId: 'builtin-news',
    title: 'NPR',
    url: 'https://www.npr.org',
    icon: faviconForUrl('https://www.npr.org'),
  },
  {
    id: 'builtin-news-nyt',
    listId: 'builtin-news',
    title: 'The New York Times',
    url: 'https://www.nytimes.com',
    icon: faviconForUrl('https://www.nytimes.com'),
  },
  {
    id: 'builtin-news-guardian',
    listId: 'builtin-news',
    title: 'The Guardian',
    url: 'https://www.theguardian.com/international',
    icon: faviconForUrl('https://www.theguardian.com/international'),
  },
  {
    id: 'builtin-news-cnn',
    listId: 'builtin-news',
    title: 'CNN',
    url: 'https://www.cnn.com',
    icon: faviconForUrl('https://www.cnn.com'),
  },
  {
    id: 'builtin-news-aljazeera',
    listId: 'builtin-news',
    title: 'Al Jazeera',
    url: 'https://www.aljazeera.com',
    icon: faviconForUrl('https://www.aljazeera.com'),
  },
]

const starterListById = new Map(STARTER_LISTS.map((item) => [item.id, item]))
const starterBookmarkById = new Map(STARTER_BOOKMARKS.map((item) => [item.id, item]))

export function isoNow() {
  return new Date().toISOString()
}

export function createRowJsonState(state?: Partial<RowJsonState>): RowJsonState {
  return {
    visible: state?.visible !== false,
    sort_index: typeof state?.sort_index === 'number' && Number.isFinite(state.sort_index) ? state.sort_index : 0,
    deleted_at: typeof state?.deleted_at === 'string' ? state.deleted_at : null,
    ...state,
  }
}

function normalizeSortIndex(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asRowArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value
  }
  if (value && typeof value === 'object') {
    return Object.values(value) as T[]
  }
  return []
}

function compareBySortIndex<T extends { json: RowJsonState }>(a: T, b: T) {
  return getSortIndex(a) - getSortIndex(b)
}

export function isVisible(row: { json?: RowJsonState | null }) {
  return row.json?.visible !== false
}

export function getSortIndex(row: { json?: RowJsonState | null }) {
  return normalizeSortIndex(row.json?.sort_index, 0)
}

export function getDeletedAt(row: { json?: RowJsonState | null }) {
  return typeof row.json?.deleted_at === 'string' ? row.json.deleted_at : null
}

export function isDeleted(row: { json?: RowJsonState | null }) {
  return Boolean(getDeletedAt(row))
}

export function patchRowState<T extends { json: RowJsonState }>(row: T, patch: Partial<RowJsonState>): T {
  return {
    ...row,
    json: createRowJsonState({
      ...row.json,
      ...patch,
    }),
  }
}

export function withUpdatedAt<T extends { updatedAt: string }>(row: T, updatedAt = isoNow()): T {
  return {
    ...row,
    updatedAt,
  }
}

function reindexBySort<T extends { json: RowJsonState }>(items: T[]) {
  return [...items]
    .sort(compareBySortIndex)
    .map((item, index) => patchRowState(item, { sort_index: index }))
}

export function createStarterLists() {
  const now = isoNow()
  return STARTER_LISTS.map((definition, index) => ({
    id: definition.id,
    name: definition.name,
    json: createRowJsonState({ visible: true, sort_index: index, deleted_at: null }),
    createdAt: now,
    updatedAt: now,
  }))
}

export function createStarterBookmarks() {
  const now = isoNow()
  return STARTER_BOOKMARKS.map((definition, index) => ({
    id: definition.id,
    listId: definition.listId,
    url: definition.url,
    title: definition.title,
    icon: definition.icon,
    json: createRowJsonState({ visible: true, sort_index: index, deleted_at: null }),
    createdAt: now,
    updatedAt: now,
  }))
}

export function normalizeLists(lists?: (Partial<BookmarkListData> | null | undefined)[]) {
  const rawInput = asRowArray<Partial<BookmarkListData> | null | undefined>(lists)
  const raw = rawInput.filter((item): item is Partial<BookmarkListData> => item != null && typeof item.id === 'string')

  return reindexBySort(
    raw.map((item, index) => ({
      id: item.id!,
      name: item.name?.trim() || starterListById.get(item.id!)?.name || 'List',
      json: createRowJsonState({
        ...(item.json || {}),
        sort_index: normalizeSortIndex(item.json?.sort_index, index),
      }),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : isoNow(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.createdAt === 'string' ? item.createdAt : isoNow(),
    })),
  )
}

export function normalizeBookmarks(
  lists: BookmarkListData[],
  bookmarks?: (Partial<BookmarkRecordData> | null | undefined)[],
) {
  const rawInput = asRowArray<Partial<BookmarkRecordData> | null | undefined>(bookmarks)
  const raw = rawInput.filter((item): item is Partial<BookmarkRecordData> => item != null && typeof item.id === 'string')
  const listIds = new Set(lists.map((item) => item.id))
  const next: BookmarkRecordData[] = []

  for (const item of raw) {
    const listId = typeof item.listId === 'string' ? item.listId : ''
    const starter = starterBookmarkById.get(item.id!)
    if (!listId || (!listIds.has(listId) && !starter)) {
      continue
    }
    next.push({
      id: item.id!,
      listId: listId || starter?.listId || '',
      url: item.url?.trim() || starter?.url || '',
      title: item.title?.trim() || item.url?.trim() || starter?.title || '',
      icon: item.icon?.trim() || starter?.icon || '',
      json: createRowJsonState(item.json || {}),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : isoNow(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.createdAt === 'string' ? item.createdAt : isoNow(),
    })
  }

  const grouped = new Map<string, BookmarkRecordData[]>()
  for (const item of next) {
    grouped.set(item.listId, [...(grouped.get(item.listId) || []), item])
  }

  return [...grouped.entries()]
    .flatMap(([listId, listItems]) =>
      reindexBySort(listItems).map((item) => ({
        ...item,
        listId,
      })),
    )
}

export function getVisibleLists(lists: BookmarkListData[]) {
  return [...lists]
    .filter((item) => !isDeleted(item) && isVisible(item))
    .sort(compareBySortIndex)
}

export function getInactiveLists(lists: BookmarkListData[]) {
  return [...lists]
    .filter((item) => !isDeleted(item) && !isVisible(item))
    .sort(compareBySortIndex)
}

export function getVisibleBookmarks(bookmarks: BookmarkRecordData[], listId: string) {
  return [...bookmarks]
    .filter((item) => item.listId === listId && !isDeleted(item) && isVisible(item))
    .sort(compareBySortIndex)
}

export function getAvailableBookmarks(bookmarks: BookmarkRecordData[], listId: string) {
  return [...bookmarks]
    .filter((item) => item.listId === listId && !isDeleted(item) && !isVisible(item))
    .sort(compareBySortIndex)
}

export function getLiveBookmarks(bookmarks: BookmarkRecordData[]) {
  return [...bookmarks].filter((item) => !isDeleted(item))
}

export function moveItemWithinVisibleSubset<T extends { id: string; json: RowJsonState }>(
  items: T[],
  visibleIds: string[],
  targetId: string,
  delta: -1 | 1,
) {
  const currentIndex = visibleIds.indexOf(targetId)
  if (currentIndex === -1) {
    return items
  }
  const nextIndex = currentIndex + delta
  if (nextIndex < 0 || nextIndex >= visibleIds.length) {
    return items
  }

  const reorderedVisibleIds = [...visibleIds]
  const [movedId] = reorderedVisibleIds.splice(currentIndex, 1)
  reorderedVisibleIds.splice(nextIndex, 0, movedId)
  const sortIndexById = new Map(reorderedVisibleIds.map((id, index) => [id, index]))

  return items.map((item) => (
    sortIndexById.has(item.id)
      ? patchRowState(item, { sort_index: sortIndexById.get(item.id)! })
      : item
  ))
}
