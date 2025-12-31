'use client'

import { useEffect, useState, ReactNode } from 'react'

interface SupabaseProviderProps {
  children: ReactNode
}

// グローバルな設定キャッシュ
declare global {
  interface Window {
    __SUPABASE_CONFIG__?: {
      url: string
      key: string
    }
  }
}

export default function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function initConfig() {
      // すでにwindowに設定がある場合はスキップ
      if (typeof window !== 'undefined' && window.__SUPABASE_CONFIG__) {
        setInitialized(true)
        return
      }

      // 環境変数をチェック
      const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (envUrl && envKey && !envUrl.includes('placeholder')) {
        if (typeof window !== 'undefined') {
          window.__SUPABASE_CONFIG__ = { url: envUrl, key: envKey }
        }
        setInitialized(true)
        return
      }

      // APIから設定を取得
      try {
        const res = await fetch('/api/config')
        const config = await res.json()

        console.log('Fetched config:', {
          hasUrl: !!config.supabaseUrl,
          hasKey: !!config.supabaseAnonKey,
        })

        if (!config.supabaseUrl || !config.supabaseAnonKey) {
          setError(`Supabase設定が見つかりません (URL: ${!!config.supabaseUrl}, Key: ${!!config.supabaseAnonKey})`)
          return
        }

        if (typeof window !== 'undefined') {
          window.__SUPABASE_CONFIG__ = {
            url: config.supabaseUrl,
            key: config.supabaseAnonKey
          }
        }
        setInitialized(true)
      } catch (e) {
        setError('設定の読み込みに失敗しました')
        console.error(e)
      }
    }

    initConfig()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="font-pixel text-xl mb-4">エラー</p>
          <p>{error}</p>
          <p className="text-sm text-gray-400 mt-2">環境変数を確認してください</p>
        </div>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="font-pixel loading-text">よみこみ中...</p>
      </div>
    )
  }

  return <>{children}</>
}
