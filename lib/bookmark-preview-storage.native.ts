import * as FileSystem from 'expo-file-system/legacy'
import { createNativePreviewStorage } from './native-preview-storage'

// Saved previews are retained: automatic loads never evict manual screenshots
// or other cached images for live bookmarks. Documents preserves offline images
// and may be included in OS device backups; bookmark exports/sync exclude them.
// Persist only file names, never iOS container paths.
const storage = createNativePreviewStorage(FileSystem, `${FileSystem.documentDirectory}bookmark-previews/`)
export const readPreview = storage.readPreview
export const writePreview = storage.writePreview
export const prunePreviews = storage.prunePreviews
