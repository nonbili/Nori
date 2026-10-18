import { jest } from 'bun:test'

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Let async query chains finish without advancing debounce/retry timers.
export async function microtasks() {
  for (let index = 0; index < 50; index++) await Promise.resolve()
}

export async function advance(ms: number) {
  jest.advanceTimersByTime(ms)
  await microtasks()
}

export async function settle<T>(promise: Promise<T>): Promise<T> {
  let settled = false
  void promise.then(() => { settled = true }, () => { settled = true })
  for (let index = 0; index < 100; index++) {
    await microtasks()
    if (settled) return promise
    if (jest.getTimerCount()) jest.advanceTimersToNextTimer()
  }
  throw new Error('Operation did not settle; check for an unresolved host request')
}
