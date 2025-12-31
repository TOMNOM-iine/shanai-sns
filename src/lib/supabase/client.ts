'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null

// ビルド時のフォールバック値（実際の値は環境変数から取得）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export function createClient() {
  if (supabaseInstance) return supabaseInstance

  supabaseInstance = createSupabaseClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sns-auth-token',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    }
  )

  return supabaseInstance
}
