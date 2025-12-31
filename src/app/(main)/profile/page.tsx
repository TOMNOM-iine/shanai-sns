'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authEmail, setAuthEmail] = useState<string>('')
  const [displayName, setDisplayName] = useState('')
  const [department, setDepartment] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // 認証ユーザーのメールを保存
    setAuthEmail(user.email || '')

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (data) {
      // emailがない場合は認証ユーザーのメールを使用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profileData = data as any
      const fallbackDisplayName =
        profileData.display_name ||
        user.user_metadata?.display_name ||
        user.email?.split('@')[0] ||
        ''
      const profileWithEmail = {
        ...profileData,
        email: profileData.email || user.email || ''
      }
      setProfile(profileWithEmail)
      setDisplayName(fallbackDisplayName)
      setDepartment(profileData.department || '')
    } else if (error) {
      console.error('Profile fetch error:', error)
    }
  }

  // 日付を安全にフォーマット
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '未設定'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '未設定'
      return date.toLocaleDateString('ja-JP')
    } catch {
      return '未設定'
    }
  }

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '未設定'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '未設定'
      return date.toLocaleString('ja-JP')
    } catch {
      return '未設定'
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    setMessage(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase.from('profiles') as any)
      .update({
        display_name: displayName.trim() || null,
        department: department.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)
      .select()
      .single()

    setIsSaving(false)

    if (error) {
      setMessage({ type: 'error', text: '保存に失敗しました' })
      console.error('Profile update error:', error)
    } else {
      if (updated) {
        const nextProfile = {
          ...(updated as Profile),
          email: updated.email || authEmail || profile.email || '',
        }
        setProfile(nextProfile)
        setDisplayName(nextProfile.display_name || '')
        setDepartment(nextProfile.department || '')
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }))
      }
      setMessage({ type: 'success', text: '保存しました' })
      setIsEditing(false)
      // サイドバーを更新するためにページをリロード
      router.refresh()
    }
  }

  const handleCancel = () => {
    setDisplayName(profile?.display_name || '')
    setDepartment(profile?.department || '')
    setIsEditing(false)
    setMessage(null)
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-pixel loading-text">読み込み中</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="font-pixel text-2xl flex items-center gap-2">
            <span className="text-red-500">♥</span>
            プロフィール
          </h1>
          <p className="text-gray-500 mt-2">アカウント情報の確認・編集</p>
        </div>

        {/* メッセージ */}
        {message && (
          <div
            className={`mb-6 p-4 border-2 ${
              message.type === 'success'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-red-500 bg-red-50 text-red-700'
            }`}
          >
            <p className="font-pixel text-sm">
              {message.type === 'success' ? '* ' : '! '}
              {message.text}
            </p>
          </div>
        )}

        {/* プロフィールカード */}
        <div className="ut-textbox mb-6">
          {/* アバター */}
          <div className="flex items-center gap-6 mb-6 pb-6 border-b-2 border-black">
            <div className="w-24 h-24 bg-black text-white flex items-center justify-center font-pixel text-4xl pixel-avatar">
              {displayName?.[0] || authEmail?.[0] || profile.email?.[0] || '?'}
            </div>
            <div>
              <p className="font-pixel text-xl">
                {displayName || authEmail || profile.email || 'ユーザー'}
              </p>
              {department && (
                <p className="text-gray-600 mt-1">{department}</p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                登録日: {formatDate(profile.created_at)}
              </p>
            </div>
          </div>

          {/* フォーム */}
          <div className="space-y-6">
            {/* メールアドレス（読み取り専用） */}
            <div>
              <label className="block font-pixel text-sm mb-2">
                * メールアドレス
              </label>
              <input
                type="email"
                value={authEmail || profile.email || ''}
                readOnly
                className="w-full px-4 py-3 border-2 border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                メールアドレスは変更できません
              </p>
            </div>

            {/* 表示名 */}
            <div>
              <label className="block font-pixel text-sm mb-2">
                * 表示名
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="表示名を入力"
                  className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:border-gray-600"
                />
              ) : (
                <div className="w-full px-4 py-3 border-2 border-gray-300 bg-gray-50">
                  {displayName || <span className="text-gray-400">未設定</span>}
                </div>
              )}
            </div>

            {/* 所属 */}
            <div>
              <label className="block font-pixel text-sm mb-2">
                * 所属・部署
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="例: 営業部、開発チーム"
                  className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:border-gray-600"
                />
              ) : (
                <div className="w-full px-4 py-3 border-2 border-gray-300 bg-gray-50">
                  {department || <span className="text-gray-400">未設定</span>}
                </div>
              )}
            </div>

            {/* ステータス */}
            <div>
              <label className="block font-pixel text-sm mb-2">
                * ステータス
              </label>
              <div className="flex items-center gap-2 px-4 py-3 border-2 border-gray-300 bg-gray-50">
                <span
                  className={`w-3 h-3 rounded-full ${
                    profile.status === 'online'
                      ? 'bg-green-500'
                      : profile.status === 'away'
                      ? 'bg-yellow-500'
                      : 'bg-gray-400'
                  }`}
                />
                <span className="text-gray-700">
                  {profile.status === 'online'
                    ? 'オンライン'
                    : profile.status === 'away'
                    ? '離席中'
                    : 'オフライン'}
                </span>
              </div>
            </div>
          </div>

          {/* ボタン */}
          <div className="mt-8 flex gap-4">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-black text-white font-pixel border-2 border-black hover:bg-gray-800 disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存する'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-white text-black font-pixel border-2 border-black hover:bg-gray-100"
                >
                  キャンセル
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 px-6 py-3 bg-black text-white font-pixel border-2 border-black hover:bg-gray-800"
              >
                編集する
              </button>
            )}
          </div>
        </div>

        {/* アカウント情報 */}
        <div className="ut-textbox">
          <h2 className="font-pixel text-lg mb-4">* アカウント情報</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">ユーザーID:</span>
              <span className="font-mono text-xs">{profile.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">最終更新:</span>
              <span>{formatDateTime(profile.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
