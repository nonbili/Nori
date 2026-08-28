/**
 * Desktop implementation of the sliver of the WebExtension API the shared
 * extension code uses. Aliased over `wxt/browser` in vite.config.ts, so
 * `extension/` runs unchanged: storage goes to a JSON file through the Go
 * StoreService, links open in the system browser, and sign-in uses a loopback
 * redirect instead of `browser.identity`.
 *
 * The background script is not a separate context here — it runs in the same
 * page as the UI, and `runtime.sendMessage` is an in-page bus.
 */
import { Call } from '@wailsio/runtime'

declare const __NORI_VERSION__: string

// Wails resolves bound methods as `<go package path>.<type>.<method>`; the
// services live in desktop's `main` package.
const STORE = 'main.StoreService'
const AUTH = 'main.AuthService'
const SHELL = 'main.ShellService'

type Listener = (message: any, sender: any, sendResponse: (response?: any) => void) => unknown

const listeners = new Set<Listener>()
const alarmListeners = new Set<(alarm: { name: string }) => void>()
/**
 * The first listener registered is the background handler (main.tsx starts the
 * background before rendering). It must not receive its own broadcasts, which
 * is what the real extension's message routing gives us for free.
 */
let backgroundListener: Listener | undefined

let redirectURL = ''

/** Resolves the values that must be readable synchronously later. */
export async function initDesktopBridge() {
  redirectURL = await Call.ByName(`${AUTH}.RedirectURL`)
}

export function defineBackground<T>(definition: T | (() => void)) {
  return typeof definition === 'function' ? { main: definition as () => void } : definition
}

async function dispatch(message: any) {
  const targets = [...listeners].filter(
    (listener) => !(message?.type === 'state-changed' && listener === backgroundListener),
  )
  for (const listener of targets) {
    let settle: (response: any) => void = () => undefined
    const response = new Promise<any>((resolve) => (settle = resolve))
    const kept = listener(message, {}, settle)
    // Extension listeners return `true` to keep `sendResponse` alive.
    if (kept === true) return await response
    if (kept instanceof Promise) return await kept
  }
  return undefined
}

const local = {
  async get(keys: string | string[]) {
    const wanted = typeof keys === 'string' ? [keys] : keys
    const result: Record<string, unknown> = {}
    for (const key of wanted) {
      const raw: string = await Call.ByName(`${STORE}.Get`, key)
      if (raw) result[key] = JSON.parse(raw)
    }
    return result
  },
  async set(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      await Call.ByName(`${STORE}.Set`, key, JSON.stringify(value))
    }
  },
  async remove(keys: string | string[]) {
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      await Call.ByName(`${STORE}.Delete`, key)
    }
  },
}

export const browser = {
  storage: { local },

  runtime: {
    async sendMessage(message: any) {
      return await dispatch(message)
    },
    onMessage: {
      addListener(listener: Listener) {
        if (!backgroundListener) backgroundListener = listener
        listeners.add(listener)
      },
      removeListener(listener: Listener) {
        listeners.delete(listener)
      },
    },
    getURL: (path: string) => path,
    getManifest: () => ({ version: __NORI_VERSION__ }),
  },

  tabs: {
    async create({ url }: { url: string }) {
      await Call.ByName(`${SHELL}.OpenURL`, url)
      return {}
    },
    // The desktop window has no browsing context to read a current page from.
    async query(_filter?: Record<string, unknown>) {
      return [] as { url?: string; title?: string; favIconUrl?: string }[]
    },
  },

  identity: {
    getRedirectURL: (path = '') => (path ? `${redirectURL}/${path}` : redirectURL),
    async launchWebAuthFlow({ url }: { url: string; interactive?: boolean }) {
      return (await Call.ByName(`${AUTH}.LaunchWebAuthFlow`, url)) as string
    },
  },

  permissions: {
    // Desktop has no runtime permission prompts; everything is granted.
    async request() {
      return true
    },
  },

  alarms: {
    create(name: string, { periodInMinutes }: { periodInMinutes: number }) {
      setInterval(() => alarmListeners.forEach((listener) => listener({ name })), periodInMinutes * 60_000)
    },
    onAlarm: {
      addListener(listener: (alarm: { name: string }) => void) {
        alarmListeners.add(listener)
      },
    },
  },

  i18n: {
    getUILanguage: () => navigator.language,
  },
}
