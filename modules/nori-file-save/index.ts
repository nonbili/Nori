import { requireOptionalNativeModule } from 'expo'

interface NoriFileSaveModule {
  saveTextFile(filename: string, mimeType: string, content: string): Promise<boolean>
}

const NoriFileSave = requireOptionalNativeModule<NoriFileSaveModule>('NoriFileSave')

export const canSaveTextFile = Boolean(NoriFileSave)

/** Opens the system "save as" picker. Resolves false when the user dismisses it. */
export async function saveTextFile(filename: string, mimeType: string, content: string) {
  if (!NoriFileSave) {
    return false
  }
  return NoriFileSave.saveTextFile(filename, mimeType, content)
}
