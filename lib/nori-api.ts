const HOST = 'https://a.inks.page'

export interface NoriIosEntitlement {
  status: string
  productId?: string | null
  expiresAt?: string | null
  willRenew?: boolean | null
  linkedEmail?: string | null
}

export interface NoriEntitlement {
  plan: string
  source: 'none' | 'stripe' | 'app_store'
  email?: string | null
  ios?: NoriIosEntitlement | null
}

export interface PrepareIosPurchaseResponse {
  appAccountToken: string
  email: string
  entitlement: NoriEntitlement
}

export interface SyncIosTransactionResponse {
  entitlement: NoriEntitlement
}

export const defaultEntitlement: NoriEntitlement = {
  plan: 'free',
  source: 'none',
  email: null,
  ios: null,
}

function getErrorMessage(payload: any, fallback?: string) {
  return payload?.error?.json?.message || payload?.message || fallback || 'Request failed'
}

async function callNoriApi<T>(path: string, init?: RequestInit, authorization?: string): Promise<T> {
  const headers = new Headers(init?.headers)

  if (authorization) {
    headers.set('authorization', authorization)
  }

  const method = init?.method?.toUpperCase()
  if ((init?.body || (method && method !== 'GET' && method !== 'HEAD')) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const res = await fetch(`${HOST}/api/${path}`, {
    ...init,
    headers,
  })

  const rawText = await res.text()
  const payload = (() => {
    try {
      return rawText ? JSON.parse(rawText) : null
    } catch {
      return null
    }
  })()

  if (!res.ok || payload?.error) {
    const fallback = rawText ? `HTTP ${res.status}: ${rawText.slice(0, 200)}` : `HTTP ${res.status}`
    throw new Error(getErrorMessage(payload, fallback))
  }

  return payload?.result?.data as T
}

export const fetchNoriMe = (accessToken: string) => callNoriApi<NoriEntitlement>('nori.me', undefined, accessToken)
export const prepareIosPurchase = (accessToken: string) =>
  callNoriApi<PrepareIosPurchaseResponse>('nori.prepareIosPurchase', { method: 'POST' }, accessToken)
export const syncIosTransaction = (accessToken: string, signedTransactionInfo: string) =>
  callNoriApi<SyncIosTransactionResponse>('nori.syncIosTransaction', {
    method: 'POST',
    body: JSON.stringify({ signedTransactionInfo }),
  }, accessToken)
