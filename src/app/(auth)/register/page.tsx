'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // アカウント作成
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })

    if (signUpError) {
      setError('* アカウント作成に しっぱい しました...')
      setLoading(false)
      return
    }

    // プロフィール作成（トリガーで作成されない場合の保険）
    if (data.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase.from('profiles') as any).upsert(
        {
          id: data.user.id,
          email: email,
          display_name: displayName,
        },
        { onConflict: 'id' }
      )

      if (profileError) {
        console.error('Profile creation error:', profileError)
      }
    }

    // 強制リダイレクト（セッション同期のため）
    window.location.href = '/channels'
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* タイトル */}
        <div className="ut-textbox mb-8 text-center">
          <h1 className="text-2xl font-pixel">* アカウント作成</h1>
        </div>

        {/* フォーム */}
        <form onSubmit={handleRegister} className="sketch-border bg-white p-8 space-y-6">
          {error && (
            <div className="bg-red-100 border-2 border-red-500 p-3 text-red-700 font-pixel text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block font-pixel mb-2">* なまえ</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="hand-input w-full text-lg"
              placeholder="あなたの なまえ"
              required
            />
          </div>

          <div>
            <label className="block font-pixel mb-2">* メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="hand-input w-full text-lg"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block font-pixel mb-2">* パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="hand-input w-full text-lg"
              placeholder="6もじ いじょう"
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pixel-btn w-full py-3 text-lg disabled:opacity-50"
          >
            {loading ? (
              <span className="loading-text">作成中</span>
            ) : (
              <>
                <span className="text-red-500">♥</span> アカウントを つくる
              </>
            )}
          </button>
        </form>

        {/* リンク */}
        <div className="mt-6 text-center font-pixel">
          <p className="text-gray-600">
            すでに アカウントを もっている？
          </p>
          <Link href="/login" className="text-black underline hover:no-underline">
            * ログインする
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-gray-500 hover:text-black">
            ← もどる
          </Link>
        </div>
      </div>
    </main>
  )
}
