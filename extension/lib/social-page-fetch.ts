import { browser } from 'wxt/browser'
import { setPageFetch } from 'nori-root/lib/bookmark'
import { fetchWithTimeout } from 'nori-root/lib/fetch-with-timeout'

const THREADS_RULE_ID = 73101
const CRAWLER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

// The desktop alias intentionally implements only a subset of WebExtension APIs.
interface NetworkCapabilities {
  runtime: { getURL?: (path: string) => string }
  declarativeNetRequest?: {
    updateSessionRules(options: {
      removeRuleIds: number[]
      addRules: {
        id: number
        priority: number
        action: { type: 'modifyHeaders'; requestHeaders: { header: string; operation: 'set'; value: string }[] }
        condition: { regexFilter: string; initiatorDomains: string[]; resourceTypes: ['xmlhttprequest'] }
      }[]
    }): Promise<void>
  }
}

/** Chrome drops User-Agent from fetch options; set it at the network layer.
 * Restrict the rule to extension-initiated permalink XHRs, never browsing tabs.
 * Desktop has no DNR API and keeps its Go page transport unchanged.
 */
export function installSocialPageFetch() {
  const network = browser as typeof browser & NetworkCapabilities
  const rules = network.declarativeNetRequest
  const origin = network.runtime.getURL?.('/')
  const initiator = origin && /^(chrome|moz)-extension:/.test(origin) ? new URL(origin).hostname : undefined
  if (!rules?.updateSessionRules || !initiator) return
  let ready: Promise<void> | undefined
  setPageFetch(async (url, init) => {
    if (/^https:\/\/www\.threads\.com\/@[^/]+\/post\/[\w-]+$/.test(url) && init.headers?.['User-Agent'] === CRAWLER_AGENT) {
      ready ??= rules.updateSessionRules({
        removeRuleIds: [THREADS_RULE_ID],
        addRules: [{
          id: THREADS_RULE_ID,
          priority: 1,
          action: { type: 'modifyHeaders', requestHeaders: [{ header: 'User-Agent', operation: 'set', value: CRAWLER_AGENT }] },
          condition: {
            regexFilter: '^https://www\\.threads\\.com/@[^/]+/post/[A-Za-z0-9_-]+$',
            initiatorDomains: [initiator],
            resourceTypes: ['xmlhttprequest'],
          },
        }],
      }).catch((error) => { ready = undefined; throw error })
      await ready
    }
    return fetchWithTimeout(url, { ...init, redirect: 'follow' })
  })
}
