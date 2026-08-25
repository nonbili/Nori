import type { NoriBookmark } from '../lib/model'

export function Favicon({ bookmark, enabled = true }: { bookmark: Pick<NoriBookmark, 'icon' | 'url' | 'title'>; enabled?: boolean }) {
  if (!enabled || !bookmark.icon) return <span className="favicon fallback">{bookmark.title.slice(0, 1).toUpperCase()}</span>
  return <span className="favicon"><img src={bookmark.icon} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /></span>
}
