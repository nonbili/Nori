import { describe, expect, it } from 'bun:test'
import { parseReleaseFeed } from './changelog'

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.1.12</id>
    <updated>2026-08-10T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/nonbili/Nori/releases/tag/v0.1.12"/>
    <title>v0.1.12</title>
    <content type="html">&lt;ul&gt;&lt;li&gt;Support &lt;code&gt;undo&lt;/code&gt; for destructive actions&lt;/li&gt;&lt;li&gt;Improve sync reliability&lt;/li&gt;&lt;/ul&gt;</content>
  </entry>
  <entry>
    <updated>2026-07-01T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/nonbili/Nori/releases/tag/v0.1.11"/>
    <title>v0.1.11</title>
    <content type="html">No list here</content>
  </entry>
  <entry>
    <title>broken</title>
  </entry>
</feed>`

describe('parseReleaseFeed', () => {
  it('parses releases with their notes', () => {
    const entries = parseReleaseFeed(feed)

    expect(entries.map((entry) => entry.tag)).toEqual(['v0.1.12', 'v0.1.11'])
    expect(entries[0].url).toBe('https://github.com/nonbili/Nori/releases/tag/v0.1.12')
    expect(entries[0].updatedAt).toBe('2026-08-10T00:00:00Z')
    expect(entries[0].items).toEqual(['Support undo for destructive actions', 'Improve sync reliability'])
  })

  it('keeps releases without list items', () => {
    expect(parseReleaseFeed(feed)[1].items).toEqual([])
  })

  it('returns an empty list for an unusable feed', () => {
    expect(parseReleaseFeed('')).toEqual([])
  })
})
