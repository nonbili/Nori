// 'skipped' means the attempt did no work at all (signed out, no plan). It is
// deliberately distinct from 'synced' so callers do not record a successful sync
// for a cycle that never ran.
export type SyncAttemptOutcome = 'synced' | 'conflict' | 'skipped'

export async function runWithConflictRetry(
  runAttempt: () => Promise<SyncAttemptOutcome>,
  waitBeforeRetry: () => Promise<void>,
  maxRetries = 1,
): Promise<SyncAttemptOutcome> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const outcome = await runAttempt()
    if (outcome !== 'conflict') {
      return outcome
    }
    if (attempt === maxRetries) {
      return 'conflict'
    }
    await waitBeforeRetry()
  }
  return 'conflict'
}
