import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pgukcvgypvjwtibzlvhr.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xAsTNsNKJ4AFbcf0JSiKxA_2-5CDlg4',
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
