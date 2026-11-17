import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { NoriText } from '@/components/common/NoriText'
import { FullScreenModal } from '@/components/modal/BaseModal'
import { capturedSocialPost, CAPTURE_SCRIPT, messageDocuments, parseCaptureMessage, READ_PAGE_SCRIPT } from '@/lib/social-post-capture'
import { storeSocialPostHere } from '@/lib/social-post-autosave'
import { isIncompleteSave } from '@/lib/social-post-save'
import { socialTarget, type SocialPost } from '@/lib/social-post'
import { showToast } from '@/lib/toast'
import { getUserAgent } from '@/lib/useragent'
import { NoriWebView, type NoriWebViewHandle, type NoriWebViewMessageEvent } from '@/modules/nori-view'
import { ui$ } from '@/states/ui'

// Bounds what a long session on a busy feed keeps in memory.
const MAX_RESPONSES = 80
// Reads of the rendered page after it loads: a signed-in page fills in after the load event.
const PAGE_READ_DELAYS = [500, 2500, 6000]

function Capture({ url }: { url: string }) {
  const { t } = useTranslation()
  const target = useMemo(() => socialTarget(url), [url])
  const view = useRef<NoriWebViewHandle>(null)
  // Parsed once on arrival: each response's documents, and the latest read of the page's own.
  const responses = useRef<any[][]>([])
  const page = useRef<any[]>([])
  const parseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const readTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [post, setPost] = useState<SocialPost>()
  const [saving, setSaving] = useState(false)
  const found = useRef(false)

  useEffect(() => () => {
    clearTimeout(parseTimer.current)
    readTimers.current.forEach(clearTimeout)
  }, [])

  const close = () => ui$.socialCapture.set(null)

  // Coalesced: a feed page can answer dozens of requests in a burst.
  const scheduleParse = () => {
    if (found.current || !target) return
    clearTimeout(parseTimer.current)
    parseTimer.current = setTimeout(() => {
      const value = capturedSocialPost(target, [...responses.current.flat(), ...page.current])
      if (value) {
        found.current = true
        // Only the post is needed from here on; a busy page's payloads can be large.
        responses.current = []
        page.current = []
        readTimers.current.forEach(clearTimeout)
        setPost(value)
      }
    }, 300)
  }

  const onMessage = (event: NoriWebViewMessageEvent) => {
    const message = parseCaptureMessage(event.nativeEvent.data)
    if (!message || found.current) return
    const documents = messageDocuments(message)
    if (message.type === 'nori-capture-page') page.current = documents
    else if (documents.length) {
      responses.current.push(documents)
      if (responses.current.length > MAX_RESPONSES) responses.current.shift()
    } else return
    scheduleParse()
  }

  const onLoadEnd = () => {
    readTimers.current.forEach(clearTimeout)
    readTimers.current = PAGE_READ_DELAYS.map((delay) => setTimeout(() => {
      if (!found.current) view.current?.injectJavaScript(READ_PAGE_SCRIPT)
    }, delay))
  }

  const save = async () => {
    if (!post || saving) return
    setSaving(true)
    try {
      await storeSocialPostHere(url, post)
      showToast(t('socialPost.saved'))
      close()
    } catch (error) {
      setSaving(false)
      showToast(t(isIncompleteSave(error) ? 'socialPost.keptSaved' : 'socialPost.failed'))
    }
  }

  return (
    <FullScreenModal visible title={t('socialPost.saveFromPage')} onClose={close}>
      <View className="flex-1 gap-3">
        <View className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white">
          <NoriWebView
            ref={view}
            source={url}
            // Facebook's own data is read in the shape its desktop site loads it in.
            userAgent={getUserAgent(Platform.OS, target?.site === 'facebook')}
            injectedJavaScriptBeforeContentLoaded={CAPTURE_SCRIPT}
            onMessage={onMessage}
            onLoadEnd={onLoadEnd}
            style={{ flex: 1 }}
          />
        </View>
        <View className="flex-row items-center gap-3">
          {post ? null : <ActivityIndicator size="small" />}
          <NoriText className="flex-1 text-sm text-content-muted" numberOfLines={2}>
            {post ? t('socialPost.foundPost', { author: post.author }) : t('socialPost.findingPost')}
          </NoriText>
          <Pressable
            accessibilityRole="button"
            disabled={!post || saving}
            onPress={() => void save()}
            className="min-h-[44px] items-center justify-center rounded-full bg-accent-fill px-5 active:bg-accent-fill-pressed"
            style={{ opacity: post && !saving ? 1 : 0.4 }}
          >
            <NoriText className="font-medium text-accent-on">{t('socialPost.savePost')}</NoriText>
          </Pressable>
        </View>
      </View>
    </FullScreenModal>
  )
}

/** A post's own page, for saving it where a plain fetch is refused, e.g. when the site asks to sign in. */
export function SocialCaptureSheet() {
  const capture = useValue(ui$.socialCapture)
  if (!capture) return null
  return <Capture key={capture.url} url={capture.url} />
}
