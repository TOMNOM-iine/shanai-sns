'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/layout/Sidebar'
import type { Profile } from '@/types/database'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const checkAuthAndProfile = async () => {
      try {
        // 認証状態を確認
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        console.log('Auth check result:', { authUser: !!authUser, authError })

        if (authError || !authUser) {
          console.log('No auth user, redirecting...')
          setLoading(false)
          setAuthChecked(true)
          window.location.href = '/login'
          return
        }

        // プロフィールを取得
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single()

        console.log('Profile fetch result:', { profile: !!profile, profileError })

        if (profileError || !profile) {
          // プロフィールがなければ作成
          console.log('Creating profile...')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newProfile, error: createError } = await (supabase.from('profiles') as any)
            .upsert({
              id: authUser.id,
              email: authUser.email || '',
              display_name: authUser.user_metadata?.display_name || 'ユーザー',
            }, { onConflict: 'id' })
            .select()
            .single()

          console.log('Profile create result:', { newProfile: !!newProfile, createError })

          if (newProfile) {
            setUser(newProfile)
          }
        } else {
          setUser(profile)
        }
      } catch (err) {
        console.error('Auth check error:', err)
        window.location.href = '/login'
      } finally {
        setLoading(false)
        setAuthChecked(true)
      }
    }

    checkAuthAndProfile()

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state change:', event)

        if (event === 'SIGNED_OUT') {
          setUser(null)
          window.location.href = '/login'
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="ut-textbox">
          <p className="font-pixel loading-text text-xl">よみこみ中...</p>
        </div>
      </div>
    )
  }

  // 認証チェック済みでユーザーがいない場合
  if (authChecked && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="ut-textbox">
          <p className="font-pixel text-xl">ログインページへ移動中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
