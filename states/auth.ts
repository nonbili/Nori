import type { Session, UserMetadata } from '@supabase/supabase-js'
import { observable } from '@legendapp/state'
import { defaultEntitlement, fetchNoriMe, type NoriEntitlement } from '@/lib/nori-api'
import { supabaseAuth } from '@/lib/supabase/client'

interface Store extends NoriEntitlement {
  loaded: boolean
  refreshing: boolean
  accessToken: string
  userId: string | undefined
  userEmail: string | undefined
  user: UserMetadata | undefined
  lastError?: string
}

export const auth$ = observable<Store>({
  ...defaultEntitlement,
  loaded: false,
  refreshing: false,
  accessToken: '',
  userId: undefined,
  userEmail: undefined,
  user: undefined,
  lastError: undefined,
})

function applySession(session: Session | null) {
  auth$.assign({
    loaded: true,
    accessToken: session?.access_token || '',
    userId: session?.user.id,
    userEmail: session?.user.email,
    user: session?.user.user_metadata,
  })

  if (!session) {
    auth$.assign({
      ...defaultEntitlement,
      refreshing: false,
      lastError: undefined,
    })
  }
}

export async function refreshEntitlement() {
  const accessToken = auth$.accessToken.peek()
  if (!accessToken) {
    auth$.assign({
      ...defaultEntitlement,
      refreshing: false,
      lastError: undefined,
    })
    return defaultEntitlement
  }

  auth$.refreshing.set(true)
  try {
    const entitlement = await fetchNoriMe(accessToken)
    auth$.assign({
      ...entitlement,
      refreshing: false,
      lastError: undefined,
    })
    return entitlement
  } catch (error) {
    auth$.assign({
      refreshing: false,
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function bootstrapAuth() {
  const { data } = await supabaseAuth.getSession()
  applySession(data.session)
  await refreshEntitlement().catch(() => undefined)
}

supabaseAuth.onAuthStateChange((_event, session) => {
  applySession(session)
  void refreshEntitlement().catch(() => undefined)
})
