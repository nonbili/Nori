import { deferred } from './async'

type Row = { id: string; updated_at: string; [key: string]: unknown }
type Table = 'lists' | 'bookmarks'
export interface Query {
  table: Table
  write?: (Record<string, unknown> & { id: string })[]
  cursor?: string
  keyset?: string
  limit: number
}

/** In-memory host adapter: real sync code still performs its pulls, merges and pushes. */
export function syncServer() {
  const tables: Record<Table, Row[]> = { lists: [], bookmarks: [] }
  const calls: Query[] = []
  let intercept: ((query: Query) => Promise<void> | void) | undefined
  const from = (table: Table) => {
    const query: Query = { table, limit: Infinity }
    const builder = {
      select: (_columns: string) => builder,
      order: (_column: string, _options: unknown) => builder,
      limit: (limit: number) => { query.limit = limit; return builder },
      gt: (_column: string, cursor: string) => { query.cursor = cursor; return builder },
      or: (keyset: string) => { query.keyset = keyset; return builder },
      upsert: (rows: NonNullable<Query['write']>, _options: unknown) => { query.write = structuredClone(rows); return builder },
      then: (resolve: (result: { data: Row[]; error: unknown }) => unknown, reject: (error: unknown) => unknown) => (
        (async () => {
          calls.push(structuredClone(query))
          try {
            await intercept?.(query)
            if (query.write) {
              const written: Row[] = query.write.map((row) => ({
                created_at: '2026-01-01T00:00:00.000Z', ...row,
                updated_at: new Date(Date.now()).toISOString(),
              }))
              for (const row of written) {
                const index = tables[table].findIndex((old) => old.id === row.id)
                if (index === -1) tables[table].push(row)
                else tables[table][index] = row
              }
              return { data: structuredClone(written), error: null }
            }
            let rows = [...tables[table]].sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
            if (query.cursor) rows = rows.filter((row) => row.updated_at > query.cursor!)
            if (query.keyset) {
              const keyset = /^updated_at\.gt\."([^"]*)",and\(updated_at\.eq\."[^"]*",id\.gt\."([^"]*)"\)$/.exec(query.keyset)
              if (!keyset) throw new Error(`Unsupported keyset filter: ${query.keyset}`)
              const [, updatedAt, id] = keyset
              rows = rows.filter((row) => row.updated_at > updatedAt || (row.updated_at === updatedAt && row.id.localeCompare(id) > 0))
            }
            return { data: structuredClone(rows.slice(0, query.limit)), error: null }
          } catch (error) { return { data: [], error } }
        })().then(resolve, reject)
      ),
    }
    return builder
  }
  return {
    from, tables, calls,
    intercept: (handler?: typeof intercept) => { intercept = handler },
    holdNext(predicate: (query: Query) => boolean) {
      const entered = deferred<Query>()
      const resume = deferred()
      intercept = (query) => {
        if (!predicate(query)) return
        intercept = undefined
        entered.resolve(structuredClone(query))
        return resume.promise
      }
      return { entered: entered.promise, release: () => resume.resolve() }
    },
    reset() { tables.lists = []; tables.bookmarks = []; calls.length = 0; intercept = undefined },
  }
}
