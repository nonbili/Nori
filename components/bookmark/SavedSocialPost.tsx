import { useEffect, useState } from 'react'
import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { NoriText } from '@/components/common/NoriText'
import { auth$ } from '@/states/auth'
import { readPreview } from '@/lib/bookmark-preview-storage'
import { onPreviewChange } from '@/lib/bookmark-preview'
import { openUrl } from '@/lib/open-url'
import { SNS_LIMITS, richTextSegments, safeWebUrl, type RichText } from '@/lib/sns-schema'
import { readSavedPost } from '@/lib/saved-social-post'
import { socialKey, socialTarget, type SavedPost, type SocialMedia, type SocialPost } from '@/lib/social-post'

const providerLabels = new Map(Object.entries({ bluesky: 'Bluesky', mastodon: 'Mastodon', reddit: 'Reddit', x: 'X', instagram: 'Instagram', threads: 'Threads', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' }))

function useSavedImage(item?: SocialMedia) {
  const [image, setImage] = useState<{ key: string; uri: string }>()
  useEffect(() => {
    let active = true
    const key = item?.cacheKey
    if (key) void readPreview(key).then((value) => {
      if (active) setImage({ key, uri: value?.imageUri || '' })
    }).catch(() => {})
    return () => { active = false }
  }, [item?.cacheKey])
  return image?.key === item?.cacheKey ? image?.uri : undefined
}

function RichContent({ value }: { value: RichText }) {
  const [revealed, setRevealed] = useState(false)
  return <NoriText className="text-sm leading-relaxed text-content">{richTextSegments(value).map((segment, index) => {
    const types = new Set(segment.entities.map((entity) => entity.type))
    const target = segment.entities.find((entity) => ['link', 'mention', 'hashtag', 'cashtag'].includes(entity.type) && 'url' in entity && safeWebUrl(entity.url))
    const url = target && 'url' in target ? target.url : undefined
    const hidden = types.has('spoiler') && !revealed
    const classes = [types.has('bold') ? 'font-bold' : '', types.has('italic') ? 'italic' : '',
      types.has('underline') ? 'underline' : '', types.has('strikethrough') ? 'line-through' : '',
      types.has('code') || types.has('pre') ? 'font-mono bg-muted' : '', url ? 'text-accent-600 underline' : ''].join(' ')
    return <NoriText key={index} className={classes} onPress={hidden || url ? (event) => {
      event.stopPropagation()
      if (hidden) setRevealed(true)
      else if (url) void openUrl(url)
    } : undefined}>{hidden ? '▇'.repeat(Array.from(segment.text).length) : segment.text}</NoriText>
  })}</NoriText>
}

function SavedImage({ item }: { item: SocialMedia }) {
  const { t } = useTranslation()
  const uri = useSavedImage(item)
  const ratio = item.width && item.height && item.width > 0 && item.height > 0 ? item.width / item.height : 4 / 3
  return <View className="overflow-hidden rounded-xl bg-muted">
    {uri ? <Image source={{ uri }} accessibilityLabel={item.alt} style={{ width: '100%', aspectRatio: Math.max(0.65, Math.min(2, ratio)) }} contentFit="contain" /> : null}
    {item.type === 'video' || item.type === 'audio' ? <View className="absolute bottom-2 left-2 rounded-full bg-surface px-3 py-1">
      <NoriText className="text-xs text-content">▶ {t(item.type === 'audio' ? 'socialPost.audio' : 'socialPost.video')}</NoriText>
    </View> : null}
  </View>
}

function Author({ post }: { post: SocialPost }) {
  const uri = useSavedImage(post.avatar)
  return <View className="flex-row items-center gap-3">
    {uri ? <Image source={{ uri }} style={{ width: 42, height: 42, borderRadius: 21 }} accessible={false} /> :
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <NoriText className="text-base font-medium text-content-muted">{post.author.slice(0, 1).toUpperCase()}</NoriText>
      </View>}
    <View className="min-w-0 flex-1 gap-1">
      <NoriText className="text-sm font-semibold text-content" numberOfLines={1}>{post.author}</NoriText>
      {post.handle ? <NoriText className="text-xs text-content-muted" numberOfLines={1}>
        {post.handle.startsWith('u/') ? post.handle : `@${post.handle}`}
      </NoriText> : null}
    </View>
    <NoriText className="text-xs text-content-muted">{providerLabels.get(post.site) || post.site}</NoriText>
  </View>
}

export function SavedSocialPost({ post, depth = 0 }: { post: SocialPost; depth?: number }) {
  const { i18n, t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const hidden = Boolean(post.contentWarning || post.sensitive) && !revealed
  const date = post.createdAt && Number.isFinite(Date.parse(post.createdAt)) ? new Date(post.createdAt).toLocaleString(i18n.language.replace('_', '-'), {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : ''
  return <View className={`w-full gap-3 p-4 ${depth ? 'rounded-xl border border-line' : ''}`}>
    <Author post={post} />
    {post.contentWarning ? <RichContent value={post.contentWarning} /> : null}
    {hidden ? <Pressable accessibilityRole="button" className="self-start rounded-xl bg-muted px-4 py-2" onPress={(event) => {
      event.stopPropagation()
      setRevealed(true)
    }}><NoriText className="text-sm font-medium text-content">{t('socialPost.reveal')}</NoriText></Pressable> : <>
    {post.title ? <RichContent value={post.title} /> : null}
    {post.richText ? <RichContent value={post.richText} /> : post.text ? <NoriText className="text-sm leading-relaxed text-content">{post.text}</NoriText> : null}
    {post.media.map((item, index) => <SavedImage key={`${item.cacheKey}:${index}`} item={item} />)}
    {post.links?.map((link, index) => <Pressable key={`${link.url}:${index}`} className="gap-2 rounded-xl border border-line p-3" onPress={(event) => {
      event.stopPropagation()
      if (safeWebUrl(link.url)) void openUrl(link.url)
    }}>
      {link.thumbnail ? <SavedImage item={link.thumbnail} /> : null}
      <NoriText className="text-sm font-semibold text-content">{link.title || link.url}</NoriText>
      {link.description ? <NoriText className="text-sm text-content-muted">{link.description}</NoriText> : null}
    </Pressable>)}
    {post.relations?.map((relation, index) => <View key={`${relation.type}:${index}`} className="gap-2">
      <NoriText className="text-xs text-content-muted">{t(`socialPost.relation.${relation.type}`)}</NoriText>
      {relation.state === 'available' && relation.post && depth < SNS_LIMITS.depth ? <SavedSocialPost post={relation.post} depth={depth + 1} /> :
        relation.state === 'unavailable' ? <NoriText className="text-xs text-content-muted">{t('socialPost.unavailable')}</NoriText> : null}
    </View>)}
    {post.nested && depth < SNS_LIMITS.depth ? <SavedSocialPost post={post.nested} depth={depth + 1} /> : null}
    </>}
    {date ? <NoriText className="text-xs text-content-muted">{date}</NoriText> : null}
  </View>
}

export function useSavedSocialPost(url: string) {
  const owner = useValue(auth$.userId)
  // Every tile calls this: only a post permalink can have an archive, so skip the read otherwise.
  const supported = Boolean(socialTarget(url))
  const [loaded, setLoaded] = useState<{ url: string; saved?: SavedPost }>()
  useEffect(() => {
    if (!owner || !supported) return
    let active = true
    const load = () => {
      void readSavedPost(url, owner).then((saved) => {
        if (active) setLoaded({ url, saved })
      }).catch(() => {})
    }
    load()
    const key = socialKey(url)
    const unsubscribe = onPreviewChange((changed) => { if (changed === key) load() })
    return () => { active = false; unsubscribe() }
  }, [url, owner, supported])
  return loaded?.url === url && loaded.saved?.owner === owner ? loaded.saved : undefined
}
