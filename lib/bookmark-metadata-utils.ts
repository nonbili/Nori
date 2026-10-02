import { hasPlaceholderTitle } from './bookmark-title'

interface Metadata {
  title: string
  icon: string
}

export async function resolveBookmarkMetadata(
  url: string,
  preferRendered: boolean,
  fetchMetadata: (url: string) => Promise<Metadata>,
  renderMetadata: (url: string) => Promise<Metadata | null>,
): Promise<Metadata> {
  if (preferRendered) {
    try {
      const rendered = await renderMetadata(url)
      if (rendered?.title && !hasPlaceholderTitle(rendered.title, url)) {
        return rendered
      }
    } catch {}
  }
  return fetchMetadata(url)
}

export function canApplyBookmarkMetadata(
  previous: { url: string; title: string },
  current: { url: string; title: string } | undefined,
  deleted: boolean,
) {
  return !!current && !deleted && current.url === previous.url && current.title === previous.title
}

export function needsBookmarkMetadata(title: string, url: string) {
  return title === url || hasPlaceholderTitle(title, url)
}
