'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

export default function NewDMPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchCurrentUser()
    fetchUsers()
  }, [])

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setCurrentUser(data)
    }
  }

  const fetchUsers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id || '')
      .order('display_name')
    if (data) setUsers(data)
  }

  const startDM = async (targetUser: Profile) => {
    if (!currentUser) return
    setLoading(true)

    // 既存のDMを確認
    const { data: existingDM } = await supabase
      .from('direct_messages')
      .select('id')
      .or(
        `and(user1_id.eq.${currentUser.id},user2_id.eq.${targetUser.id}),and(user1_id.eq.${targetUser.id},user2_id.eq.${currentUser.id})`
      )
      .single()

    if (existingDM) {
      router.push(`/dm/${targetUser.id}`)
      return
    }

    // 新しいDMを作成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newDM, error } = await (supabase.from('direct_messages') as any)
      .insert({
        user1_id: currentUser.id,
        user2_id: targetUser.id,
      })
      .select()
      .single()

    if (newDM) {
      router.push(`/dm/${targetUser.id}`)
    }
    setLoading(false)
  }

  const filteredUsers = users.filter(
    (user) =>
      user.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col p-8">
      {/* ヘッダー */}
      <div className="ut-textbox mb-8">
        <h1 className="text-2xl font-pixel">* 新しい DM</h1>
        <p className="mt-2">はなしたい ひとを えらんでね</p>
      </div>

      {/* 検索 */}
      <div className="sketch-border bg-white p-4 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="なまえ または メールアドレス で けんさく..."
          className="hand-input w-full text-lg"
        />
      </div>

      {/* ユーザー一覧 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredUsers.length === 0 ? (
          <p className="text-center text-gray-500 font-pixel py-8">
            * ユーザーが みつかりません
          </p>
        ) : (
          filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => startDM(user)}
              disabled={loading}
              className="w-full sketch-border bg-white p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-pixel text-xl pixel-avatar">
                {user.display_name?.[0] || '?'}
              </div>
              <div>
                <p className="font-pixel text-lg">{user.display_name}</p>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
              <span className="ml-auto text-2xl text-red-500">♥</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
