import * as FileSystem from 'expo-file-system/legacy'
import { readSocialImageFile } from './social-post-image-core'

export { normalizeSocialImage } from './social-post-image-core'
export const readSocialImage = (uri: string) => readSocialImageFile(uri,
  (path) => FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 }))
