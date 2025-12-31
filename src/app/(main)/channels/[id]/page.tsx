'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Message, Profile, Channel } from '@/types/database'
import dynamic from 'next/dynamic'
import DOMPurify from 'dompurify'
import RichTextEditor, { RichTextEditorHandle } from '@/components/editor/RichTextEditor'
import VoiceInputButton from '@/components/editor/VoiceInputButton'
import { stripHtml } from '@/lib/text/stripHtml'
import { upsertSearchDocument, deleteSearchDocument } from '@/lib/search/indexDocument'

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
  const [newMessageHtml, setNewMessageHtml] = useState('')
  const [newMessageText, setNewMessageText] = useState('')
  const [user, setUser] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [inMeeting, setInMeeting] = useState(false)
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null)
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null)
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [incomingCall, setIncomingCall] = useState<MeetingInvitation | null>(null)
  const [meetingMinimized, setMeetingMinimized] = useState(true) // デフォルトで最小化
  const [memberRole, setMemberRole] = useState<'owner' | 'admin' | 'member' | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<MessageWithUser[]>([])
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({})
  const [pinnedMessages, setPinnedMessages] = useState<MessageWithUser[]>([])
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [reactionsMap, setReactionsMap] = useState<Record<string, { emoji: string; count: number; reacted: boolean }[]>>({})
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingHtml, setEditingHtml] = useState<string>('')
  const [threadReplyHtml, setThreadReplyHtml] = useState('')
  const [threadReplyText, setThreadReplyText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const threadEditorRef = useRef<RichTextEditorHandle>(null)
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
    setActiveThreadId(null)
    setThreadMessages([])
    fetchUser()
    fetchChannel()
    fetchMessages()
    fetchThreadCounts()
    fetchPinnedMessages()
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
            if (newMsg.parent_id) {
              setThreadCounts((prev) => ({
                ...prev,
                [newMsg.parent_id as string]: (prev[newMsg.parent_id as string] || 0) + 1,
              }))
              if (activeThreadId === newMsg.parent_id) {
                setThreadMessages((prev) => [...prev, newMsg as MessageWithUser])
              }
            } else {
              setMessages((prev) => [...prev, newMsg as MessageWithUser])
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${id}`,
        },
        async (payload) => {
          const { data: updated } = await supabase
            .from('messages')
            .select('*, profiles:user_id(*)')
            .eq('id', payload.new.id)
            .single()
          if (!updated) return
          if (updated.parent_id) {
            setThreadMessages((prev) =>
              prev.map((msg) => (msg.id === updated.id ? (updated as MessageWithUser) : msg))
            )
          } else {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updated.id ? (updated as MessageWithUser) : msg))
            )
          }
        }
      )
      .subscribe()

    return () => {
      messageSubscription.unsubscribe()
    }
  }, [id, activeThreadId])

  useEffect(() => {
    if (user && messages.length > 0) {
      fetchSavedMessages()
      const ids = [...messages.map((m) => m.id), ...threadMessages.map((m) => m.id)]
      fetchReactions(ids)
    }
  }, [user, messages, threadMessages])

  useEffect(() => {
    if (user && id) {
      fetchMembership()
    }
  }, [user, id])

  // ページ表示時とメッセージ受信時に既読にする
  useEffect(() => {
    if (user && messages.length > 0) {
      markChannelAsRead()
    }
  }, [user, messages.length, markChannelAsRead])

  useEffect(() => {
    if (!user || messages.length === 0) return
    const reactionSubscription = supabase
      .channel(`reactions:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (payload) => {
          const newData = payload.new as { message_id?: string } | null
          const oldData = payload.old as { message_id?: string } | null
          const targetId = newData?.message_id || oldData?.message_id
          if (targetId && (messages.some((m) => m.id === targetId) || threadMessages.some((m) => m.id === targetId))) {
            const ids = [...messages.map((m) => m.id), ...threadMessages.map((m) => m.id)]
            fetchReactions(ids)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(reactionSubscription)
    }
  }, [id, user, messages.length, threadMessages.length])

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
      .is('parent_id', null)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as MessageWithUser[])
    setLoading(false)
  }

  const fetchThreadCounts = async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, parent_id')
      .eq('channel_id', id)
      .not('parent_id', 'is', null)
    const counts: Record<string, number> = {}
    ;(data || []).forEach((row: { parent_id: string | null }) => {
      if (!row.parent_id) return
      counts[row.parent_id] = (counts[row.parent_id] || 0) + 1
    })
    setThreadCounts(counts)
  }

  const fetchPinnedMessages = async () => {
    const { data } = await supabase
      .from('channel_message_pins')
      .select('message_id, messages(*, profiles:user_id(*))')
      .eq('channel_id', id)
      .order('created_at', { ascending: false })

    const pinned = (data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => row.messages)
      .filter(Boolean) as MessageWithUser[]
    setPinnedMessages(pinned)
  }

  const fetchSavedMessages = async () => {
    if (!user) return
    const { data } = await supabase
      .from('saved_channel_messages')
      .select('message_id')
      .eq('user_id', user.id)
    const ids = new Set((data || []).map((row) => row.message_id))
    setSavedMessageIds(ids)
  }

  const fetchReactions = async (messageIds: string[]) => {
    if (!user || messageIds.length === 0) return
    const { data } = await supabase
      .from('reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', messageIds)

    const reactionMap: Record<string, { emoji: string; count: number; reacted: boolean }[]> = {}
    ;(data || []).forEach((row) => {
      if (!reactionMap[row.message_id]) reactionMap[row.message_id] = []
      const existing = reactionMap[row.message_id].find((r) => r.emoji === row.emoji)
      if (existing) {
        existing.count += 1
        if (row.user_id === user.id) existing.reacted = true
      } else {
        reactionMap[row.message_id].push({
          emoji: row.emoji,
          count: 1,
          reacted: row.user_id === user.id,
        })
      }
    })
    setReactionsMap(reactionMap)
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name')
    if (data) setUsers(data)
  }

  const fetchMembership = async () => {
    if (!user) return
    const { data } = await supabase
      .from('channel_members')
      .select('role')
      .eq('channel_id', id)
      .eq('user_id', user.id)
      .single()
    setMemberRole(data?.role || null)
  }

  const openThread = async (messageId: string) => {
    setActiveThreadId(messageId)
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:user_id(*)')
      .eq('channel_id', id)
      .eq('parent_id', messageId)
      .order('created_at', { ascending: true })
    setThreadMessages((data || []) as MessageWithUser[])
  }

  const sendChannelMessage = async (html: string, text: string, parentId?: string | null) => {
    const plainText = text || stripHtml(html)
    if (!user || !plainText.trim() || channel?.is_archived) return

    const mentionedNames = (plainText.match(/@(\S+)/g) || []).map((m) =>
      m.slice(1).trim()
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (supabase.from('messages') as any)
      .insert({
        channel_id: id as string,
        user_id: user.id,
        content: html,
        parent_id: parentId || null,
      })
      .select()
      .single()

    if (!error && inserted?.id) {
      await upsertSearchDocument({
        sourceType: 'channel_message',
        sourceId: inserted.id,
        title: channel?.name || 'channel',
        content: plainText,
        channelId: id as string,
        userId: user.id,
        metadata: { channelName: channel?.name || '' },
      })
    }

    if (!error) {
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
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessageText.trim()) return
    await sendChannelMessage(newMessageHtml, newMessageText, null)
    setNewMessageHtml('')
    setNewMessageText('')
    editorRef.current?.setHtml('')
  }

  const sendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeThreadId || !threadReplyText.trim()) return
    await sendChannelMessage(threadReplyHtml, threadReplyText, activeThreadId)
    setThreadReplyHtml('')
    setThreadReplyText('')
    threadEditorRef.current?.setHtml('')
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return
    const current = reactionsMap[messageId] || []
    const hasReacted = current.find((r) => r.emoji === emoji && r.reacted)
    if (hasReacted) {
      await supabase
        .from('reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
      setReactionsMap((prev) => {
        const next = { ...prev }
        const list = (next[messageId] || []).map((r) =>
          r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r
        ).filter((r) => r.count > 0)
        next[messageId] = list
        return next
      })
    } else {
      await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      })
      setReactionsMap((prev) => {
        const next = { ...prev }
        const list = next[messageId] ? [...next[messageId]] : []
        const target = list.find((r) => r.emoji === emoji)
        if (target) {
          target.count += 1
          target.reacted = true
        } else {
          list.push({ emoji, count: 1, reacted: true })
        }
        next[messageId] = list
        return next
      })
    }
  }

  const togglePin = async (messageId: string) => {
    if (!user) return
    const isPinned = pinnedMessages.some((msg) => msg.id === messageId)
    if (isPinned) {
      await supabase
        .from('channel_message_pins')
        .delete()
        .eq('message_id', messageId)
      fetchPinnedMessages()
    } else {
      await supabase
        .from('channel_message_pins')
        .insert({
          channel_id: id as string,
          message_id: messageId,
          pinned_by: user.id,
        })
      fetchPinnedMessages()
    }
  }

  const toggleSave = async (messageId: string) => {
    if (!user) return
    if (savedMessageIds.has(messageId)) {
      await supabase
        .from('saved_channel_messages')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
      setSavedMessageIds((prev) => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    } else {
      await supabase
        .from('saved_channel_messages')
        .insert({ message_id: messageId, user_id: user.id })
      setSavedMessageIds((prev) => new Set(prev).add(messageId))
    }
  }

  const startEdit = (message: MessageWithUser) => {
    setEditingMessageId(message.id)
    setEditingHtml(message.content)
  }

  const saveEdit = async () => {
    if (!editingMessageId || !user) return
    await supabase
      .from('messages')
      .update({ content: editingHtml, edited_at: new Date().toISOString() })
      .eq('id', editingMessageId)
    await upsertSearchDocument({
      sourceType: 'channel_message',
      sourceId: editingMessageId,
      title: channel?.name || 'channel',
      content: stripHtml(editingHtml),
      channelId: id as string,
      userId: user.id,
      metadata: { channelName: channel?.name || '' },
    })
    setEditingMessageId(null)
    setEditingHtml('')
  }

  const cancelEdit = () => {
    setEditingMessageId(null)
    setEditingHtml('')
  }

  const deleteMessage = async (messageId: string) => {
    if (!confirm('このメッセージを削除しますか？')) return
    await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), content: '' })
      .eq('id', messageId)
    await deleteSearchDocument('channel_message', messageId)
  }

  const toggleArchive = async () => {
    if (!channel || !user) return
    setArchiving(true)
    const nextArchived = !channel.is_archived
    const { data } = await supabase
      .from('channels')
      .update({
        is_archived: nextArchived,
        archived_at: nextArchived ? new Date().toISOString() : null,
        archived_by: nextArchived ? user.id : null,
      })
      .eq('id', channel.id)
      .select()
      .single()
    if (data) {
      setChannel(data as Channel)
    }
    setArchiving(false)
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
        const { data: meetingMsg } = await (supabase.from('messages') as any)
          .insert({
            channel_id: id as string,
            user_id: user.id,
            content: `🎥 ミーティングを開始しました！ @メンションで招待できます`,
          })
          .select()
          .single()
        if (meetingMsg?.id) {
          await upsertSearchDocument({
            sourceType: 'channel_message',
            sourceId: meetingMsg.id,
            title: channel.name,
            content: 'ミーティングを開始しました',
            channelId: id as string,
            userId: user.id,
            metadata: { channelName: channel.name },
          })
        }
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

  const sanitizeContent = (content: string) => {
    return DOMPurify.sanitize(content || '')
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

  const activeThreadMessage = messages.find((msg) => msg.id === activeThreadId) || null

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

      <div className="h-full flex">
        <div className="flex-1 flex flex-col">
          {/* チャンネルヘッダー */}
          <header className="p-4 border-b-4 border-black bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-pixel">#</span>
              <div>
                <h1 className="font-pixel text-xl flex items-center gap-2">
                  {channel?.name}
                  {channel?.is_archived && (
                    <span className="text-xs text-red-500 font-pixel">アーカイブ</span>
                  )}
                </h1>
                <p className="text-sm text-gray-600">{channel?.description}</p>
              </div>
            </div>

            {/* ミーティングボタン */}
            <div className="flex items-center gap-2">
              {memberRole && (memberRole === 'owner' || memberRole === 'admin') && (
                <button
                  onClick={toggleArchive}
                  disabled={archiving}
                  className="pixel-btn bg-yellow-100 hover:bg-yellow-400"
                >
                  {archiving
                    ? '更新中'
                    : channel?.is_archived
                    ? 'アーカイブ解除'
                    : 'アーカイブ'}
                </button>
              )}
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
          {pinnedMessages.length > 0 && (
            <div className="sketch-border bg-white p-3">
              <div className="font-pixel text-sm mb-2">📌 ピン留め</div>
              <div className="space-y-2">
                {pinnedMessages.map((pinned) => (
                  <div key={pinned.id} className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-700 truncate">
                      {stripHtml(pinned.content).slice(0, 80)}
                    </div>
                    <button
                      onClick={() => togglePin(pinned.id)}
                      className="pixel-btn text-xs px-2 py-1"
                    >
                      解除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            messages.map((message) => {
              const isOwn = message.user_id === user?.id
              const reactions = reactionsMap[message.id] || []
              const isPinned = pinnedMessages.some((p) => p.id === message.id)
              const isSaved = savedMessageIds.has(message.id)
              const threadCount = threadCounts[message.id] || 0
              const emojiPicker = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '👀']

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 group ${isOwn ? 'flex-row-reverse' : ''}`}
                >
                  <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-pixel pixel-avatar flex-shrink-0">
                    {message.profiles?.display_name?.[0] || '?'}
                  </div>

                  <div className="flex flex-col max-w-[75%]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-pixel text-sm">
                        {message.profiles?.display_name}
                      </span>
                      <span className="text-xs opacity-60">
                        {formatTime(message.created_at)}
                      </span>
                      {message.edited_at && (
                        <span className="text-xs text-gray-500">編集済み</span>
                      )}
                    </div>

                    <div
                      className={`chat-message ${isOwn ? 'sent' : 'received'}`}
                    >
                      {editingMessageId === message.id ? (
                        <div className="space-y-2">
                          <RichTextEditor
                            value={editingHtml}
                            onChange={(html) => setEditingHtml(html)}
                            placeholder="メッセージを編集..."
                          />
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="pixel-btn text-sm">
                              保存
                            </button>
                            <button onClick={cancelEdit} className="pixel-btn text-sm bg-gray-200">
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : message.is_deleted ? (
                        <p className="text-xs text-gray-500">
                          このメッセージは削除されました
                        </p>
                      ) : (
                        <div
                          className="message-content text-sm"
                          dangerouslySetInnerHTML={{ __html: sanitizeContent(message.content) }}
                        />
                      )}
                    </div>

                    {reactions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {reactions.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            onClick={() => toggleReaction(message.id, reaction.emoji)}
                            className={`text-xs border border-black px-2 py-1 ${
                              reaction.reacted ? 'bg-yellow-100' : 'bg-white'
                            }`}
                          >
                            {reaction.emoji} {reaction.count}
                          </button>
                        ))}
                      </div>
                    )}

                    {reactionTargetId === message.id && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {emojiPicker.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              toggleReaction(message.id, emoji)
                              setReactionTargetId(null)
                            }}
                            className="text-sm border border-black px-2 py-1 bg-white hover:bg-gray-100"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600 opacity-0 group-hover:opacity-100">
                      <button onClick={() => openThread(message.id)}>
                        返信{threadCount > 0 ? ` (${threadCount})` : ''}
                      </button>
                      <button onClick={() => setReactionTargetId(message.id)}>🙂</button>
                      <button onClick={() => togglePin(message.id)}>
                        {isPinned ? '📌解除' : '📌ピン'}
                      </button>
                      <button onClick={() => toggleSave(message.id)}>
                        {isSaved ? '★保存済み' : '☆保存'}
                      </button>
                      {isOwn && !message.is_deleted && (
                        <>
                          <button onClick={() => startEdit(message)}>編集</button>
                          <button onClick={() => deleteMessage(message.id)}>削除</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
          </div>

          {/* メッセージ入力 */}
          <form onSubmit={sendMessage} className="p-4 border-t-4 border-black bg-white">
          {channel?.is_archived && (
            <div className="mb-3 text-xs text-red-600 font-pixel">
              このチャンネルはアーカイブされています。投稿はできません。
            </div>
          )}
          <div className="space-y-3">
            <RichTextEditor
              ref={editorRef}
              value={newMessageHtml}
              onChange={(html, text) => {
                setNewMessageHtml(html)
                setNewMessageText(text)
              }}
              placeholder={inMeeting ? '@メンションで招待...' : 'メッセージを にゅうりょく...'}
              disabled={channel?.is_archived}
            />
            <div className="flex items-center gap-3">
              <VoiceInputButton
                onTranscript={(text) => editorRef.current?.insertText(`${text} `)}
                disabled={channel?.is_archived}
              />
              <button
                type="submit"
                className="pixel-btn px-6"
                disabled={channel?.is_archived || !newMessageText.trim()}
              >
                <span className="text-red-500">♥</span> 送信
              </button>
            </div>
          </div>
          {inMeeting && (
            <p className="text-xs text-green-600 mt-2">
              🎥 ミーティング中 - @でユーザーを招待できます
            </p>
          )}
          </form>
        </div>

        {activeThreadId && (
          <aside className="w-96 border-l-4 border-black bg-white flex flex-col">
            <div className="p-4 border-b-2 border-black flex items-center justify-between">
              <h2 className="font-pixel text-lg">スレッド</h2>
              <button
                onClick={() => setActiveThreadId(null)}
                className="pixel-btn text-sm px-3 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 border-b-2 border-black bg-gray-50">
              {activeThreadMessage ? (
                <>
                  <div className="text-xs text-gray-500 mb-1">
                    {activeThreadMessage.profiles?.display_name} · {formatTime(activeThreadMessage.created_at)}
                  </div>
                  <div
                    className="message-content text-sm"
                    dangerouslySetInnerHTML={{ __html: sanitizeContent(activeThreadMessage.content) }}
                  />
                </>
              ) : (
                <p className="text-xs text-gray-500">スレッドの親メッセージが見つかりません</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-xs text-gray-500">まだ返信がありません</p>
              ) : (
                threadMessages.map((reply) => {
                  const reactions = reactionsMap[reply.id] || []
                  const emojiPicker = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '👀']
                  return (
                    <div key={reply.id} className="border-2 border-black p-3 bg-white">
                      <div className="text-xs text-gray-500 mb-1">
                        {reply.profiles?.display_name} · {formatTime(reply.created_at)}
                      </div>
                      {reply.is_deleted ? (
                        <p className="text-xs text-gray-400">このメッセージは削除されました</p>
                      ) : editingMessageId === reply.id ? (
                        <div className="space-y-2">
                          <RichTextEditor
                            value={editingHtml}
                            onChange={(html) => setEditingHtml(html)}
                            placeholder="メッセージを編集..."
                          />
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="pixel-btn text-sm">
                              保存
                            </button>
                            <button onClick={cancelEdit} className="pixel-btn text-sm bg-gray-200">
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="message-content text-sm"
                          dangerouslySetInnerHTML={{ __html: sanitizeContent(reply.content) }}
                        />
                      )}

                      {reactions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {reactions.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              onClick={() => toggleReaction(reply.id, reaction.emoji)}
                              className={`text-xs border border-black px-2 py-1 ${
                                reaction.reacted ? 'bg-yellow-100' : 'bg-white'
                              }`}
                            >
                              {reaction.emoji} {reaction.count}
                            </button>
                          ))}
                        </div>
                      )}

                      {reactionTargetId === reply.id && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {emojiPicker.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                toggleReaction(reply.id, emoji)
                                setReactionTargetId(null)
                              }}
                              className="text-sm border border-black px-2 py-1 bg-white hover:bg-gray-100"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-3 mt-2 text-xs text-gray-600">
                        <button onClick={() => setReactionTargetId(reply.id)}>🙂</button>
                        {reply.user_id === user?.id && !reply.is_deleted && (
                          <>
                            <button onClick={() => startEdit(reply)}>編集</button>
                            <button onClick={() => deleteMessage(reply.id)}>削除</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form onSubmit={sendThreadReply} className="p-4 border-t-2 border-black bg-white space-y-3">
              <RichTextEditor
                ref={threadEditorRef}
                value={threadReplyHtml}
                onChange={(html, text) => {
                  setThreadReplyHtml(html)
                  setThreadReplyText(text)
                }}
                placeholder="スレッドに返信..."
              />
              <div className="flex items-center gap-3">
                <VoiceInputButton
                  onTranscript={(text) => threadEditorRef.current?.insertText(`${text} `)}
                />
                <button type="submit" className="pixel-btn">
                  返信
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </>
  )
}
