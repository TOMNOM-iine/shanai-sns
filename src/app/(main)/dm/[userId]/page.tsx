'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'
import dynamic from 'next/dynamic'

// 動的インポート（SSRを無効化）
const VideoCall = dynamic(() => import('@/components/meeting/VideoCall'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="ut-textbox">
        <p className="font-pixel loading-text">通話準備中</p>
      </div>
    </div>
  ),
})

interface DmMessage {
  id: string
  dm_id: string
  sender_id: string
  content: string
  created_at: string
  profiles?: Profile
}

export default function DMPage() {
  const { userId } = useParams()
  const [targetUser, setTargetUser] = useState<Profile | null>(null)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [dmId, setDmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inCall, setInCall] = useState(false)
  const [callUrl, setCallUrl] = useState<string | null>(null)
  const [startingCall, setStartingCall] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    initDM()
  }, [userId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // DMを既読にする
  const markDmAsRead = useCallback(async () => {
    if (!currentUser || !dmId) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('dm_reads') as any)
        .upsert({
          user_id: currentUser.id,
          dm_id: dmId,
          last_read_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,dm_id'
        })
      // テーブルが存在しない場合のエラーは無視
      if (error && !error.message.includes('does not exist')) {
        console.error('Failed to mark DM as read:', error)
      }
    } catch (error) {
      // マイグレーション未実行時は無視
    }
  }, [currentUser, dmId, supabase])

  useEffect(() => {
    if (!dmId) return

    const subscription = supabase
      .channel(`dm_messages:${dmId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `dm_id=eq.${dmId}`,
        },
        async (payload) => {
          const { data: newMsg } = await supabase
            .from('dm_messages')
            .select('*, profiles:sender_id(*)')
            .eq('id', payload.new.id)
            .single()
          if (newMsg) {
            setMessages((prev) => [...prev, newMsg as DmMessage])
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [dmId])

  // ページ表示時とメッセージ受信時に既読にする
  useEffect(() => {
    if (currentUser && dmId && messages.length > 0) {
      markDmAsRead()
    }
  }, [currentUser, dmId, messages.length, markDmAsRead])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const initDM = async () => {
    // 現在のユーザーを取得
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setCurrentUser(profile)

    // 相手のプロフィールを取得
    const { data: target } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setTargetUser(target)

    // DMを取得または作成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingDM } = await (supabase.from('direct_messages') as any)
      .select('id')
      .or(
        `and(user1_id.eq.${user.id},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${user.id})`
      )
      .single()

    let dmIdToUse = existingDM?.id

    if (!existingDM) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newDM } = await (supabase.from('direct_messages') as any)
        .insert({
          user1_id: user.id,
          user2_id: userId as string,
        })
        .select()
        .single()
      dmIdToUse = newDM?.id
    }

    if (dmIdToUse) {
      setDmId(dmIdToUse)
      fetchMessages(dmIdToUse)
    }
    setLoading(false)
  }

  const fetchMessages = async (dmIdParam: string) => {
    const { data } = await supabase
      .from('dm_messages')
      .select('*, profiles:sender_id(*)')
      .eq('dm_id', dmIdParam)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as DmMessage[])
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !currentUser || !dmId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('dm_messages') as any).insert({
      dm_id: dmId,
      sender_id: currentUser.id,
      content: newMessage,
    })

    if (!error) {
      setNewMessage('')
    }
  }

  const startCall = async () => {
    if (!currentUser || !targetUser) return
    setStartingCall(true)

    try {
      const response = await fetch('/api/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: `dm-${currentUser.id}-${targetUser.id}`,
        }),
      })

      const data = await response.json()

      if (data.url) {
        setCallUrl(data.url)
        setInCall(true)

        // DMに通話開始を通知
        if (dmId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('dm_messages') as any).insert({
            dm_id: dmId,
            sender_id: currentUser.id,
            content: `📞 音声通話を開始しました！参加する: ${data.url}`,
          })
        }
      }
    } catch (error) {
      console.error('Call error:', error)
      alert('通話の開始に失敗しました')
    } finally {
      setStartingCall(false)
    }
  }

  const leaveCall = useCallback(() => {
    setInCall(false)
    setCallUrl(null)
  }, [])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="ut-textbox">
          <p className="font-pixel loading-text">よみこみ中</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 通話画面 */}
      {inCall && callUrl && currentUser && (
        <VideoCall
          roomUrl={callUrl}
          userName={currentUser.display_name || 'ゲスト'}
          onLeave={leaveCall}
        />
      )}

      <div className="h-full flex flex-col">
        {/* ヘッダー */}
        <header className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-pixel text-lg pixel-avatar">
                {targetUser?.display_name?.[0] || '?'}
              </div>
              <div>
                <h1 className="font-pixel text-xl">{targetUser?.display_name}</h1>
                <p className="text-sm text-gray-600">{targetUser?.email}</p>
              </div>
            </div>

            {/* 通話ボタン */}
            <button
              onClick={startCall}
              disabled={startingCall}
              className="pixel-btn flex items-center gap-2 bg-blue-100 hover:bg-blue-500"
            >
              {startingCall ? (
                <span className="loading-text">接続中</span>
              ) : (
                <>
                  <span>📞</span>
                  <span className="font-pixel">音声通話</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-pixel text-gray-500">
                * まだ メッセージが ありません
              </p>
              <p className="text-gray-400 mt-2">
                {targetUser?.display_name} さんに メッセージを おくろう！
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.sender_id === currentUser?.id ? 'flex-row-reverse' : ''
                }`}
              >
                <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-pixel pixel-avatar flex-shrink-0">
                  {message.profiles?.display_name?.[0] || '?'}
                </div>

                <div
                  className={`chat-message ${
                    message.sender_id === currentUser?.id ? 'sent' : 'received'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-pixel text-sm">
                      {message.profiles?.display_name}
                    </span>
                    <span className="text-xs opacity-60">
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* メッセージ入力 */}
        <form onSubmit={sendMessage} className="p-4 border-t-4 border-black bg-white">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="メッセージを にゅうりょく..."
              className="hand-input flex-1 text-lg"
            />
            <button type="submit" className="pixel-btn px-6">
              <span className="text-red-500">♥</span> 送信
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
