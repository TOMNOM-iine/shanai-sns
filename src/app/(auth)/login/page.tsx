'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('* ログインに しっぱい しました...')
      setLoading(false)
      return
    }

    // 強制リダイレクト（セッション同期のため）
    window.location.href = '/channels'
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* タイトル */}
        <div className="ut-textbox mb-8 text-center">
          <h1 className="text-2xl font-pixel">* ログイン</h1>
        </div>

        {/* フォーム */}
        <form onSubmit={handleLogin} className="sketch-border bg-white p-8 space-y-6">
          {error && (
            <div className="bg-red-100 border-2 border-red-500 p-3 text-red-700 font-pixel text-sm">
              {error}
            </div>
          )}

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
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pixel-btn w-full py-3 text-lg disabled:opacity-50"
          >
            {loading ? (
              <span className="loading-text">ログイン中</span>
            ) : (
              <>
                <span className="text-red-500">♥</span> ログイン
              </>
            )}
          </button>
        </form>

        {/* リンク */}
        <div className="mt-6 text-center font-pixel">
          <p className="text-gray-600">
            アカウントを もっていない？
          </p>
          <Link href="/register" className="text-black underline hover:no-underline">
            * アカウントを つくる
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
