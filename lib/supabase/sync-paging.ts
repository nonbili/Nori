// PostgREST caps every response at the project's `max_rows` (1000), so reads are
// paged. Keyset over (updated_at, id) rather than offsets: each page is its own
// snapshot, and under this ordering a row written mid-scan moves ahead of the
// scan point instead of shifting the rows behind it out of view.
export const SYNC_PAGE_SIZE = 500

export interface RowKeyset {
  updatedAt: string
  id: string
}

function quoteFilterValue(value: string) {
  return `"${value.replace(/"/g, '')}"`
}

// PostgREST filter for "ordered after this row" over (updated_at, id).
export function keysetFilter({ updatedAt, id }: RowKeyset) {
  const at = quoteFilterValue(updatedAt)
  return `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${quoteFilterValue(id)})`
}

// Every page, or it throws. A caller reconciling against a truncated snapshot
// would read the rows that did not fit as missing from the server.
export async function collectPagedRows<T extends { id: string; updated_at: string }>(
  fetchPage: (keyset?: RowKeyset) => Promise<T[]>,
  pageSize = SYNC_PAGE_SIZE,
) {
  const rows: T[] = []
  let keyset: RowKeyset | undefined

  for (;;) {
    const page = await fetchPage(keyset)
    rows.push(...page)
    if (page.length < pageSize) {
      return rows
    }

    const last = page[page.length - 1]
    keyset = { updatedAt: last.updated_at, id: last.id }
  }
}
