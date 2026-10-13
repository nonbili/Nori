import { createMMKV } from 'react-native-mmkv'

// What a preview tile needs to lay itself out before its image has loaded again. MMKV is read
// synchronously, so a cold start sizes every image on the first frame instead of growing it
// once onLoad has measured it. Keyed by preview key, not image uri.
const store = createMMKV({ id: 'previewLayout' })

// Preview keys hold the page url, which may contain a backslash, and MMKV's web build throws on one.
const storeKey = encodeURIComponent

export function getImageRatio(key: string) {
  return key ? store.getNumber(storeKey(key)) : undefined
}

export function setImageRatio(key: string, ratio: number) {
  if (key && Number.isFinite(ratio) && ratio > 0) store.set(storeKey(key), ratio)
}

export function pruneImageRatios(keys: ReadonlySet<string>) {
  const live = new Set([...keys].map(storeKey))
  for (const key of store.getAllKeys()) if (!live.has(key)) store.remove(key)
}
