import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { SCREENSHOT_BUCKET } from '@/lib/screenshot-sync'
import { SOCIAL_POST_BUCKET } from '@/lib/social-post'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

const client = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

export const supabase = client.schema('nori')
export const supabaseAuth = client.auth
export const screenshotBucket = client.storage.from(SCREENSHOT_BUCKET)
export const socialPostBucket = client.storage.from(SOCIAL_POST_BUCKET)
