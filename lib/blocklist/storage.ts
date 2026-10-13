import { Directory, File, Paths } from 'expo-file-system'
import type { BlocklistSourceId, PersistedBlocklistMatcherSnapshot } from './types'

const STORAGE_DIR_NAME = 'blocklist'
const MATCHER_FILENAME = 'matcher.json'
const SOURCE_FILENAMES: Record<BlocklistSourceId, string> = {
  easylist: 'easylist.txt',
  easyprivacy: 'easyprivacy.txt',
  braveFirstparty: 'brave-firstparty.txt',
  braveFirstpartyRegional: 'brave-firstparty-regional.txt',
}

const dirUri = () => `${Paths.document.uri}${STORAGE_DIR_NAME}`
const sourceFile = (id: BlocklistSourceId) => new File(`${dirUri()}/${SOURCE_FILENAMES[id]}`)
const matcherFile = () => new File(`${dirUri()}/${MATCHER_FILENAME}`)

function ensureDir() {
  const dir = new Directory(dirUri())
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }
}

function writeFile(file: File, body: string) {
  ensureDir()
  if (!file.exists) {
    file.create({ overwrite: true, intermediates: true })
  }
  file.write(body)
}

function parsePersistedMatcherSnapshot(raw: string): PersistedBlocklistMatcherSnapshot | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.revision !== 'number' ||
      typeof parsed.blockedHosts !== 'string' ||
      typeof parsed.allowedHosts !== 'string'
    ) {
      return null
    }
    return {
      revision: parsed.revision,
      ...(typeof parsed.parserVersion === 'number' ? { parserVersion: parsed.parserVersion } : {}),
      blockedHosts: parsed.blockedHosts,
      allowedHosts: parsed.allowedHosts,
    }
  } catch {
    return null
  }
}

export async function readBlocklistSourceFile(id: BlocklistSourceId) {
  const file = sourceFile(id)
  // textSync(): the async text() handle can be released before the native read completes.
  return file.exists ? file.textSync() : null
}

export async function readBlocklistMatcherSnapshot() {
  const file = matcherFile()
  return file.exists ? parsePersistedMatcherSnapshot(file.textSync()) : null
}

export async function writeBlocklistSourceFile(id: BlocklistSourceId, body: string) {
  writeFile(sourceFile(id), body)
}

export async function writeBlocklistMatcherSnapshot(snapshot: PersistedBlocklistMatcherSnapshot) {
  writeFile(matcherFile(), JSON.stringify(snapshot))
}

export async function hasBlocklistSourceFiles(ids: readonly BlocklistSourceId[]) {
  return ids.every((id) => {
    const file = sourceFile(id)
    return file.exists && file.size > 0
  })
}
