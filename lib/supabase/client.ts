import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
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
