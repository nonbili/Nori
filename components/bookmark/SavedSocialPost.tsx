import { useEffect, useState } from 'react'
import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useThemeColors } from '@/lib/theme'
import { NoriText } from '@/components/common/NoriText'
import { Favicon } from '@/components/bookmark/Favicon'
import { SocialMediaGallery } from '@/components/bookmark/SocialMediaGallery'
import { useSavedImage } from '@/components/bookmark/useSavedImage'
import { onPreviewChange } from '@/lib/bookmark-preview'
import { openUrl } from '@/lib/open-url'
import { SNS_LIMITS, richTextSegments, safeWebUrl, type RichText } from '@/lib/sns-schema'
import { readSavedPost } from '@/lib/saved-social-post'
import { UNOWNED } from '@/lib/social-post-sync'
import { localCaptureOwner$ } from '@/lib/social-post-autosave'
import { socialKey, socialTarget, type SavedPost, type SocialMedia, type SocialPost } from '@/lib/social-post'

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

function SavedImage({ item, onOpen }: { item: SocialMedia; onOpen?: () => void }) {
  const { t } = useTranslation()
  const contentColor = useThemeColors().content
  const uri = useSavedImage(item)
  const ratio = item.width && item.height && item.width > 0 && item.height > 0 ? item.width / item.height : 4 / 3
  return <Pressable disabled={!uri || !onOpen} accessibilityRole={onOpen ? 'imagebutton' : undefined} className="overflow-hidden rounded-xl bg-muted" onPress={(event) => {
    event.stopPropagation()
    onOpen?.()
  }}>
    {uri ? <Image source={{ uri }} accessibilityLabel={item.alt} style={{ width: '100%', aspectRatio: Math.max(0.65, Math.min(2, ratio)) }} contentFit="contain" /> : null}
    {item.type === 'video' || item.type === 'audio' ? <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-full bg-surface py-1 pl-2 pr-3">
      <MaterialIcons name={item.type === 'audio' ? 'graphic-eq' : 'play-arrow'} size={14} color={contentColor} />
      <NoriText className="text-xs text-content">{t(item.type === 'audio' ? 'socialPost.audio' : 'socialPost.video')}</NoriText>
    </View> : null}
  </Pressable>
}

function Author({ post, date, compact }: { post: SocialPost; date: string; compact: boolean }) {
  const uri = useSavedImage(post.avatar)
  const size = compact ? 32 : 40
  const handle = post.handle ? (post.handle.startsWith('u/') ? post.handle : `@${post.handle}`) : ''
  return <View className="flex-row items-center gap-3">
    {/* The provider's favicon sits on the avatar as a badge, so it marks the source without taking a column. */}
    <View style={{ width: size, height: size }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} accessible={false} /> :
        <View className="items-center justify-center rounded-full bg-muted" style={{ width: size, height: size }}>
          <NoriText className="text-base font-medium text-content-muted">{post.author.slice(0, 1).toUpperCase()}</NoriText>
        </View>}
      <View className="absolute" style={{ right: -4, bottom: -4 }}>
        <Favicon pageUrl={post.url} slotSize={18} iconSize={14} fallbackIconSize={12}
          wrapperClassName="items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface" />
      </View>
    </View>
    <View className="min-w-0 flex-1">
      <NoriText className="text-sm font-semibold text-content" numberOfLines={1}>{post.author}</NoriText>
      {handle || date ? <NoriText className="text-xs text-content-muted" numberOfLines={1}>
        {[handle, date].filter(Boolean).join(' · ')}
      </NoriText> : null}
    </View>
  </View>
}

export function SavedSocialPost({ post, depth = 0 }: { post: SocialPost; depth?: number }) {
  const { i18n, t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<number>()
  const hidden = Boolean(post.contentWarning || post.sensitive) && !revealed
  const date = post.createdAt && Number.isFinite(Date.parse(post.createdAt)) ? new Date(post.createdAt).toLocaleDateString(i18n.language.replace('_', '-'), {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : ''
  return <View className={`w-full gap-3 ${depth ? 'rounded-xl border border-line p-3' : 'p-4'}`}>
    <Author post={post} date={date} compact={depth > 0} />
    {post.contentWarning ? <RichContent value={post.contentWarning} /> : null}
    {hidden ? <Pressable accessibilityRole="button" className="self-start rounded-xl bg-muted px-4 py-2" onPress={(event) => {
      event.stopPropagation()
      setRevealed(true)
    }}><NoriText className="text-sm font-medium text-content">{t('socialPost.reveal')}</NoriText></Pressable> : <>
    {post.title ? <RichContent value={post.title} /> : null}
    {post.richText ? <RichContent value={post.richText} /> : post.text ? <NoriText className="text-sm leading-relaxed text-content">{post.text}</NoriText> : null}
    {post.media.map((item, index) => <SavedImage key={`${item.cacheKey}:${index}`} item={item} onOpen={() => setGalleryIndex(index)} />)}
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
    <SocialMediaGallery media={post.media} index={galleryIndex} onChange={setGalleryIndex} onClose={() => setGalleryIndex(undefined)} />
  </View>
}

export function useSavedSocialPost(url: string) {
  const owner = useValue(localCaptureOwner$)
  // Every tile calls this: only a post permalink can have an archive, so skip the read otherwise.
  const supported = Boolean(socialTarget(url))
  const [loaded, setLoaded] = useState<{ url: string; saved?: SavedPost }>()
  useEffect(() => {
    if (!supported) return
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
  return loaded?.url === url && (loaded.saved?.owner === owner || loaded.saved?.owner === UNOWNED) ? loaded.saved : undefined
}
