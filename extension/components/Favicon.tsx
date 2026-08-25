import type { NoriBookmark } from '../lib/model'

export function Favicon({
  bookmark,
  enabled = true,
  variant = 'tile',
}: {
  bookmark: Pick<NoriBookmark, 'icon' | 'url' | 'title'>
  enabled?: boolean
  variant?: 'tile' | 'row'
}) {
  const className = `favicon ${variant}`
  if (!enabled || !bookmark.icon)
    return <span className={`${className} fallback`}>{bookmark.title.slice(0, 1).toUpperCase()}</span>
  return (
    <span className={className}>
      <img
        src={bookmark.icon}
        alt=""
        draggable={false}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    </span>
  )
}
