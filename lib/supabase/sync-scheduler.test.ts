import { describe, expect, it } from 'bun:test'
import { runWithConflictRetry } from './sync-scheduler'

describe('sync scheduler', () => {
  it('retries a revision conflict once and then succeeds', async () => {
    let attempts = 0
    let waits = 0
    const outcome = await runWithConflictRetry(
      async () => {
        attempts += 1
        return attempts === 1 ? 'conflict' : 'synced'
      },
      async () => {
        waits += 1
      },
    )

    expect(attempts).toBe(2)
    expect(waits).toBe(1)
    expect(outcome).toBe('synced')
  })

  it('bounds conflicts and requests a later follow-up', async () => {
    let attempts = 0
    const outcome = await runWithConflictRetry(
      async () => {
        attempts += 1
        return 'conflict'
      },
      async () => undefined,
    )

    expect(attempts).toBe(2)
    expect(outcome).toBe('conflict')
  })

  it('reports a skipped attempt without retrying', async () => {
    let attempts = 0
    const outcome = await runWithConflictRetry(
      async () => {
        attempts += 1
        return 'skipped'
      },
      async () => undefined,
    )

    expect(attempts).toBe(1)
    expect(outcome).toBe('skipped')
  })

  it('does not retry failures', async () => {
    let attempts = 0
    await expect(runWithConflictRetry(
      async () => {
        attempts += 1
        throw new Error('offline')
      },
      async () => undefined,
    )).rejects.toThrow('offline')
    expect(attempts).toBe(1)
  })
})
