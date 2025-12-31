'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Message, Profile, Channel } from '@/types/database'
import dynamic from 'next/dynamic'

// 動的インポート（SSRを無効化）
const VideoCall = dynamic(() => import('@/components/meeting/VideoCall'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="ut-textbox">
        <p className="font-pixel loading-text">ミーティング準備中</p>
      </div>
    </div>
  ),
})

const IncomingCall = dynamic(() => import('@/components/meeting/IncomingCall'), {
  ssr: false,
})

interface MessageWithUser extends Message {
  profiles: Profile
}

interface MeetingInvitation {
  id: string
  meeting_id: string
  inviter_id: string
  invitee_id: string
  status: string
  meeting?: {
    id: string
    room_url: string
    channel_id: string
    host_id: string
    channels?: Channel
  }
  inviter?: Profile
}

export default function ChannelPage() {
  const { id } = useParams()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [user, setUser] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [inMeeting, setInMeeting] = useState(false)
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null)
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null)
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [incomingCall, setIncomingCall] = useState<MeetingInvitation | null>(null)
  const [meetingMinimized, setMeetingMinimized] = useState(true) // デフォルトで最小化
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // チャンネルを既読にする
  const markChannelAsRead = useCallback(async () => {
    if (!user || !id) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('channel_reads') as any)
        .upsert({
          user_id: user.id,
          channel_id: id as string,
          last_read_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,channel_id'
        })
      // テーブルが存在しない場合のエラーは無視
      if (error && !error.message.includes('does not exist')) {
        console.error('Failed to mark channel as read:', error)
      }
    } catch (error) {
      // マイグレーション未実行時は無視
    }
  }, [user, id, supabase])

  useEffect(() => {
    fetchUser()
    fetchChannel()
    fetchMessages()
    fetchUsers()

    // リアルタイム購読（メッセージ）
    const messageSubscription = supabase
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${id}`,
        },
        async (payload) => {
          const { data: newMsg } = await supabase
            .from('messages')
            .select('*, profiles:user_id(*)')
            .eq('id', payload.new.id)
            .single()
          if (newMsg) {
            setMessages((prev) => [...prev, newMsg as MessageWithUser])
          }
        }
      )
      .subscribe()

    return () => {
      messageSubscription.unsubscribe()
    }
  }, [id])

  // ページ表示時とメッセージ受信時に既読にする
  useEffect(() => {
    if (user && messages.length > 0) {
      markChannelAsRead()
    }
  }, [user, messages.length, markChannelAsRead])

  // 着信通知のリアルタイム購読
  useEffect(() => {
    if (!user) return

    const invitationSubscription = supabase
      .channel(`invitations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meeting_invitations',
          filter: `invitee_id=eq.${user.id}`,
        },
        async (payload) => {
          // 招待の詳細を取得
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: invitation, error } = await (supabase.from('meeting_invitations') as any)
            .select(`
              *,
              meetings (
                id,
                room_url,
                channel_id,
                host_id,
                channels (*)
              )
            `)
            .eq('id', payload.new.id)
            .single()

          if (error) {
            console.error('Failed to fetch invitation:', error)
            return
          }

          if (invitation && (invitation as MeetingInvitation).status === 'pending') {
            // 招待者の情報を別途取得
            const { data: inviter } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', payload.new.inviter_id)
              .single()

            setIncomingCall({
              ...invitation,
              meeting: invitation.meetings,
              inviter: inviter,
            } as MeetingInvitation)
          }
        }
      )
      .subscribe()

    return () => {
      invitationSubscription.unsubscribe()
    }
  }, [user])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      setUser(profile)
    }
  }

  const fetchChannel = async () => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('id', id)
      .single()
    setChannel(data)
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:user_id(*)')
      .eq('channel_id', id)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as MessageWithUser[])
    setLoading(false)
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name')
    if (data) setUsers(data)
  }

  // メンション検索用フィルター
  const filteredUsers = users.filter(
    (u) =>
      u.id !== user?.id &&
      u.display_name?.toLowerCase().includes(mentionQuery.toLowerCase())
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewMessage(value)

    // @の検出
    const cursorPos = e.target.selectionStart || 0
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@(\S*)$/)

    if (atMatch) {
      setMentionQuery(atMatch[1])
      setShowMentions(true)
      setMentionIndex(0)
    } else {
      setShowMentions(false)
      setMentionQuery('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => Math.min(prev + 1, filteredUsers.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectMention(filteredUsers[mentionIndex])
      } else if (e.key === 'Escape') {
        setShowMentions(false)
      }
    }
  }

  const selectMention = (selectedUser: Profile) => {
    const cursorPos = inputRef.current?.selectionStart || 0
    const textBeforeCursor = newMessage.slice(0, cursorPos)
    const textAfterCursor = newMessage.slice(cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    const newText =
      textBeforeCursor.slice(0, atIndex) +
      `@${selectedUser.display_name} ` +
      textAfterCursor

    setNewMessage(newText)
    setShowMentions(false)
    setMentionQuery('')
    inputRef.current?.focus()
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user) return

    // メンションされたユーザーを抽出
    const mentionedNames = (newMessage.match(/@(\S+)/g) || []).map((m) =>
      m.slice(1).trim()
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('messages') as any).insert({
      channel_id: id as string,
      user_id: user.id,
      content: newMessage,
    })

    if (!error) {
      // ミーティング中ならメンションされたユーザーを招待
      if (inMeeting && currentMeetingId && mentionedNames.length > 0) {
        const mentionedUsers = users.filter((u) =>
          mentionedNames.includes(u.display_name || '')
        )

        for (const invitee of mentionedUsers) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('meeting_invitations') as any).insert({
            meeting_id: currentMeetingId,
            inviter_id: user.id,
            invitee_id: invitee.id,
          })
        }
      }

      setNewMessage('')
    }
  }

  const startMeeting = async () => {
    if (!channel || !user) return
    setCreatingMeeting(true)

    try {
      const response = await fetch('/api/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: channel.name }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'ミーティングの開始に失敗しました')
        if (data.setupUrl) {
          window.open(data.setupUrl, '_blank')
        }
        setCreatingMeeting(false)
        return
      }

      if (data.url) {
        // ミーティングをDBに記録
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: meeting } = await (supabase.from('meetings') as any)
          .insert({
            channel_id: id as string,
            room_url: data.url,
            host_id: user.id,
          })
          .select()
          .single()

        if (meeting) {
          setCurrentMeetingId(meeting.id)
        }

        setMeetingUrl(data.url)
        setInMeeting(true)

        // チャンネルにミーティング開始を通知
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('messages') as any).insert({
          channel_id: id as string,
          user_id: user.id,
          content: `🎥 ミーティングを開始しました！ @メンションで招待できます`,
        })
      }
    } catch (error) {
      console.error('Meeting error:', error)
      alert('ミーティングの開始に失敗しました')
    } finally {
      setCreatingMeeting(false)
    }
  }

  const leaveMeeting = useCallback(async () => {
    // ミーティングを非アクティブに
    if (currentMeetingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('meetings') as any)
        .update({ is_active: false })
        .eq('id', currentMeetingId)
    }

    setInMeeting(false)
    setMeetingUrl(null)
    setCurrentMeetingId(null)
  }, [currentMeetingId, supabase])

  const acceptCall = async () => {
    if (!incomingCall) return

    // 招待を承諾
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('meeting_invitations') as any)
      .update({ status: 'accepted' })
      .eq('id', incomingCall.id)

    // ミーティングに参加
    if (incomingCall.meeting?.room_url) {
      setMeetingUrl(incomingCall.meeting.room_url)
      setCurrentMeetingId(incomingCall.meeting_id)
      setInMeeting(true)
    }

    setIncomingCall(null)
  }

  const declineCall = async () => {
    if (!incomingCall) return

    // 招待を拒否
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('meeting_invitations') as any)
      .update({ status: 'declined' })
      .eq('id', incomingCall.id)

    setIncomingCall(null)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // メッセージ内のメンションをハイライト
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\S+)/g)
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="bg-blue-100 text-blue-800 px-1 rounded">
            {part}
          </span>
        )
      }
      return part
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
      {/* 着信通知 */}
      {incomingCall && (
        <IncomingCall
          callerName={incomingCall.inviter?.display_name || 'ユーザー'}
          channelName={incomingCall.meeting?.channels?.name || 'チャンネル'}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

      {/* ミーティング画面 */}
      {inMeeting && meetingUrl && user && (
        <VideoCall
          roomUrl={meetingUrl}
          userName={user.display_name || 'ゲスト'}
          onLeave={leaveMeeting}
          minimized={meetingMinimized}
          onToggleMinimize={() => setMeetingMinimized(!meetingMinimized)}
        />
      )}

      <div className="h-full flex flex-col">
        {/* チャンネルヘッダー */}
        <header className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-pixel">#</span>
              <div>
                <h1 className="font-pixel text-xl">{channel?.name}</h1>
                <p className="text-sm text-gray-600">{channel?.description}</p>
              </div>
            </div>

            {/* ミーティングボタン */}
            <div className="flex items-center gap-2">
              {inMeeting && (
                <button
                  onClick={() => setMeetingMinimized(!meetingMinimized)}
                  className="pixel-btn bg-blue-100 hover:bg-blue-500"
                  title={meetingMinimized ? '全画面表示' : '最小化'}
                >
                  {meetingMinimized ? '⬜ 拡大' : '⬜ 最小化'}
                </button>
              )}
              <button
                onClick={inMeeting ? leaveMeeting : startMeeting}
                disabled={creatingMeeting}
                className={`pixel-btn flex items-center gap-2 ${
                  inMeeting
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-green-100 hover:bg-green-500'
                }`}
              >
                {creatingMeeting ? (
                  <span className="loading-text">準備中</span>
                ) : inMeeting ? (
                  <>
                    <span>📞</span>
                    <span className="font-pixel">退出</span>
                  </>
                ) : (
                  <>
                    <span>🎥</span>
                    <span className="font-pixel">ミーティング開始</span>
                  </>
                )}
              </button>
            </div>
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
                さいしょの メッセージを おくろう！
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.user_id === user?.id ? 'flex-row-reverse' : ''
                }`}
              >
                {/* アバター */}
                <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-pixel pixel-avatar flex-shrink-0">
                  {message.profiles?.display_name?.[0] || '?'}
                </div>

                {/* メッセージ本体 */}
                <div
                  className={`chat-message ${
                    message.user_id === user?.id ? 'sent' : 'received'
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
                  <p className="whitespace-pre-wrap">
                    {renderMessageContent(message.content)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* メッセージ入力 */}
        <form onSubmit={sendMessage} className="p-4 border-t-4 border-black bg-white relative">
          {/* メンションサジェスト */}
          {showMentions && filteredUsers.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white sketch-border max-h-48 overflow-y-auto z-10">
              {filteredUsers.slice(0, 5).map((u, index) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectMention(u)}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${
                    index === mentionIndex ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-pixel text-sm">
                    {u.display_name?.[0] || '?'}
                  </div>
                  <span className="font-pixel">{u.display_name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                inMeeting
                  ? '@メンションで招待...'
                  : 'メッセージを にゅうりょく...'
              }
              className="hand-input flex-1 text-lg"
            />
            <button type="submit" className="pixel-btn px-6">
              <span className="text-red-500">♥</span> 送信
            </button>
          </div>
          {inMeeting && (
            <p className="text-xs text-green-600 mt-1">
              🎥 ミーティング中 - @でユーザーを招待できます
            </p>
          )}
        </form>
      </div>
    </>
  )
}
