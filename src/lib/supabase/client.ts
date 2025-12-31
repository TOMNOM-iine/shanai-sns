'use client'

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

// 設定を取得
function getConfig(): { url: string; key: string } {
  // 1. windowのグローバル設定をチェック（SupabaseProviderで設定）
  if (typeof window !== 'undefined' && window.__SUPABASE_CONFIG__) {
    return window.__SUPABASE_CONFIG__
  }

  // 2. 環境変数をチェック（ビルド時に埋め込まれている場合）
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (envUrl && !envUrl.includes('placeholder')) {
    return { url: envUrl, key: envKey }
  }

  // 3. フォールバック（ビルド時用）
  return { url: 'https://placeholder.supabase.co', key: 'placeholder-key' }
}

export function createClient(): SupabaseClient {
  const config = getConfig()

  // placeholderの場合は毎回新しいインスタンスを返す（キャッシュしない）
  if (config.url.includes('placeholder')) {
    return createSupabaseClient(config.url, config.key)
  }

  // 有効な設定がある場合はインスタンスを再利用
  if (supabaseInstance) {
    return supabaseInstance
  }

  supabaseInstance = createSupabaseClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'sns-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  })

  return supabaseInstance
}
