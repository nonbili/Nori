// Supabase returns query failures as plain `{ message, code, details, hint }`
// objects rather than Error instances, so `String(error)` would lose them.
export function describeSyncError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    const { message, code } = error as { message?: unknown; code?: unknown }
    if (typeof message === 'string' && message) {
      return typeof code === 'string' && code ? `${message} (${code})` : message
    }
    return JSON.stringify(error)
  }
  return String(error)
}
