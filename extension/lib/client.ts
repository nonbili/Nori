import { browser } from 'wxt/browser'
import type { AppSnapshot, RequestMessage, ResponseMessage } from './model'

export async function request<T = unknown>(message: RequestMessage): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as ResponseMessage<T>
  if (!response?.ok) throw new Error(response?.error || 'Extension request failed')
  return response.data as T
}

export const getSnapshot = () => request<AppSnapshot>({ type: 'snapshot' })
