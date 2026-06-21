import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchNoriMe,
  fetchWebAuthLink,
  prepareIosPurchase,
  syncIosTransaction,
} from './nori-api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('nori api client', () => {
  it('sends authorization headers and unwraps result data', async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe('https://a.inks.page/api/nori.me')
      expect(new Headers(init?.headers).get('authorization')).toBe('token')
      expect(new Headers(init?.headers).has('content-type')).toBe(false)
      return Response.json({ result: { data: { plan: 'pro', source: 'stripe' } } })
    }) as typeof fetch

    await expect(fetchNoriMe('token')).resolves.toEqual({ plan: 'pro', source: 'stripe' })
  })

  it('adds json content-type for post requests without bodies', async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe('https://a.inks.page/api/nori.prepareIosPurchase')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      return Response.json({
        result: {
          data: {
            appAccountToken: 'account-token',
            email: 'user@example.com',
            entitlement: { plan: 'pro', source: 'app_store' },
          },
        },
      })
    }) as typeof fetch

    await expect(prepareIosPurchase('token')).resolves.toMatchObject({
      appAccountToken: 'account-token',
      email: 'user@example.com',
    })
  })

  it('sends transaction payloads as json bodies', async () => {
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ signedTransactionInfo: 'signed' }))
      expect(new Headers(init?.headers).get('authorization')).toBe('token')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      return Response.json({ result: { data: { entitlement: { plan: 'pro', source: 'app_store' } } } })
    }) as typeof fetch

    await expect(syncIosTransaction('token', 'signed')).resolves.toEqual({
      entitlement: { plan: 'pro', source: 'app_store' },
    })
  })

  it('throws api-provided error messages', async () => {
    globalThis.fetch = (async () => Response.json({
      error: {
        json: {
          message: 'No entitlement',
        },
      },
    }, { status: 200 })) as unknown as typeof fetch

    await expect(fetchWebAuthLink('token')).rejects.toThrow('No entitlement')
  })

  it('throws a useful fallback for non-json http errors', async () => {
    globalThis.fetch = (async () => new Response('server exploded', { status: 500 })) as unknown as typeof fetch

    await expect(fetchNoriMe('token')).rejects.toThrow('HTTP 500: server exploded')
  })
})
