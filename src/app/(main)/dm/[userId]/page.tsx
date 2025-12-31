'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'
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
  parent_id?: string | null
  edited_at?: string | null
  is_deleted?: boolean
  deleted_at?: string | null
  created_at: string
  profiles?: Profile
}

export default function DMPage() {
  const { userId } = useParams()
  const [targetUser, setTargetUser] = useState<Profile | null>(null)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [newMessageHtml, setNewMessageHtml] = useState('')
  const [newMessageText, setNewMessageText] = useState('')
  const [dmId, setDmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inCall, setInCall] = useState(false)
  const [callUrl, setCallUrl] = useState<string | null>(null)
  const [startingCall, setStartingCall] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<DmMessage[]>([])
  const [threadReplyHtml, setThreadReplyHtml] = useState('')
  const [threadReplyText, setThreadReplyText] = useState('')
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({})
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [reactionsMap, setReactionsMap] = useState<Record<string, { emoji: string; count: number; reacted: boolean }[]>>({})
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingHtml, setEditingHtml] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const threadEditorRef = useRef<RichTextEditorHandle>(null)
  const supabase = createClient()

  useEffect(() => {
    setActiveThreadId(null)
    setThreadMessages([])
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
            if (newMsg.parent_id) {
              setThreadCounts((prev) => ({
                ...prev,
                [newMsg.parent_id as string]: (prev[newMsg.parent_id as string] || 0) + 1,
              }))
              if (activeThreadId === newMsg.parent_id) {
                setThreadMessages((prev) => [...prev, newMsg as DmMessage])
              }
            } else {
              setMessages((prev) => [...prev, newMsg as DmMessage])
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dm_messages',
          filter: `dm_id=eq.${dmId}`,
        },
        async (payload) => {
          const { data: updated } = await supabase
            .from('dm_messages')
            .select('*, profiles:sender_id(*)')
            .eq('id', payload.new.id)
            .single()
          if (!updated) return
          if (updated.parent_id) {
            setThreadMessages((prev) =>
              prev.map((msg) => (msg.id === updated.id ? (updated as DmMessage) : msg))
            )
          } else {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updated.id ? (updated as DmMessage) : msg))
            )
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [dmId, activeThreadId])

  // ページ表示時とメッセージ受信時に既読にする
  useEffect(() => {
    if (currentUser && dmId && messages.length > 0) {
      markDmAsRead()
    }
  }, [currentUser, dmId, messages.length, markDmAsRead])

  useEffect(() => {
    if (currentUser && messages.length > 0) {
      fetchSavedMessages()
      const ids = [...messages.map((m) => m.id), ...threadMessages.map((m) => m.id)]
      fetchReactions(ids)
    }
  }, [currentUser, messages, threadMessages])

  useEffect(() => {
    if (!currentUser || messages.length === 0) return
    const reactionSubscription = supabase
      .channel(`dm_reactions:${dmId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_reactions' },
        (payload) => {
          const newData = payload.new as { dm_message_id?: string } | null
          const oldData = payload.old as { dm_message_id?: string } | null
          const targetId = newData?.dm_message_id || oldData?.dm_message_id
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
  }, [dmId, currentUser, messages.length, threadMessages.length])

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
      fetchThreadCounts(dmIdToUse)
    }
    setLoading(false)
  }

  const fetchMessages = async (dmIdParam: string) => {
    const { data } = await supabase
      .from('dm_messages')
      .select('*, profiles:sender_id(*)')
      .eq('dm_id', dmIdParam)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as DmMessage[])
  }

  const fetchThreadCounts = async (dmIdParam: string) => {
    const { data } = await supabase
      .from('dm_messages')
      .select('id, parent_id')
      .eq('dm_id', dmIdParam)
      .not('parent_id', 'is', null)
    const counts: Record<string, number> = {}
    ;(data || []).forEach((row: { parent_id: string | null }) => {
      if (!row.parent_id) return
      counts[row.parent_id] = (counts[row.parent_id] || 0) + 1
    })
    setThreadCounts(counts)
  }

  const fetchSavedMessages = async () => {
    if (!currentUser) return
    const { data } = await supabase
      .from('saved_dm_messages')
      .select('dm_message_id')
      .eq('user_id', currentUser.id)
    const ids = new Set((data || []).map((row) => row.dm_message_id))
    setSavedMessageIds(ids)
  }

  const fetchReactions = async (messageIds: string[]) => {
    if (!currentUser || messageIds.length === 0) return
    const { data } = await supabase
      .from('dm_reactions')
      .select('dm_message_id, emoji, user_id')
      .in('dm_message_id', messageIds)

    const reactionMap: Record<string, { emoji: string; count: number; reacted: boolean }[]> = {}
    ;(data || []).forEach((row) => {
      if (!reactionMap[row.dm_message_id]) reactionMap[row.dm_message_id] = []
      const existing = reactionMap[row.dm_message_id].find((r) => r.emoji === row.emoji)
      if (existing) {
        existing.count += 1
        if (row.user_id === currentUser.id) existing.reacted = true
      } else {
        reactionMap[row.dm_message_id].push({
          emoji: row.emoji,
          count: 1,
          reacted: row.user_id === currentUser.id,
        })
      }
    })
    setReactionsMap(reactionMap)
  }

  const openThread = async (messageId: string) => {
    if (!dmId) return
    setActiveThreadId(messageId)
    const { data } = await supabase
      .from('dm_messages')
      .select('*, profiles:sender_id(*)')
      .eq('dm_id', dmId)
      .eq('parent_id', messageId)
      .order('created_at', { ascending: true })
    setThreadMessages((data || []) as DmMessage[])
  }

  const sendDmMessage = async (html: string, text: string, parentId?: string | null) => {
    const plainText = text || stripHtml(html)
    if (!currentUser || !dmId || !plainText.trim()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (supabase.from('dm_messages') as any)
      .insert({
        dm_id: dmId,
        sender_id: currentUser.id,
        content: html,
        parent_id: parentId || null,
      })
      .select()
      .single()

    if (!error && inserted?.id) {
      await upsertSearchDocument({
        sourceType: 'dm_message',
        sourceId: inserted.id,
        title: targetUser?.display_name || 'DM',
        content: plainText,
        dmId: dmId,
        userId: currentUser.id,
        metadata: { targetUser: targetUser?.display_name || '' },
      })
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessageText.trim()) return
    await sendDmMessage(newMessageHtml, newMessageText, null)
    setNewMessageHtml('')
    setNewMessageText('')
    editorRef.current?.setHtml('')
  }

  const sendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeThreadId || !threadReplyText.trim()) return
    await sendDmMessage(threadReplyHtml, threadReplyText, activeThreadId)
    setThreadReplyHtml('')
    setThreadReplyText('')
    threadEditorRef.current?.setHtml('')
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return
    const current = reactionsMap[messageId] || []
    const hasReacted = current.find((r) => r.emoji === emoji && r.reacted)
    if (hasReacted) {
      await supabase
        .from('dm_reactions')
        .delete()
        .eq('dm_message_id', messageId)
        .eq('user_id', currentUser.id)
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
      await supabase.from('dm_reactions').insert({
        dm_message_id: messageId,
        user_id: currentUser.id,
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

  const toggleSave = async (messageId: string) => {
    if (!currentUser) return
    if (savedMessageIds.has(messageId)) {
      await supabase
        .from('saved_dm_messages')
        .delete()
        .eq('dm_message_id', messageId)
        .eq('user_id', currentUser.id)
      setSavedMessageIds((prev) => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    } else {
      await supabase
        .from('saved_dm_messages')
        .insert({ dm_message_id: messageId, user_id: currentUser.id })
      setSavedMessageIds((prev) => new Set(prev).add(messageId))
    }
  }

  const startEdit = (message: DmMessage) => {
    setEditingMessageId(message.id)
    setEditingHtml(message.content)
  }

  const saveEdit = async () => {
    if (!editingMessageId || !currentUser) return
    await supabase
      .from('dm_messages')
      .update({ content: editingHtml, edited_at: new Date().toISOString() })
      .eq('id', editingMessageId)
    await upsertSearchDocument({
      sourceType: 'dm_message',
      sourceId: editingMessageId,
      title: targetUser?.display_name || 'DM',
      content: stripHtml(editingHtml),
      dmId: dmId || undefined,
      userId: currentUser.id,
      metadata: { targetUser: targetUser?.display_name || '' },
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
      .from('dm_messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), content: '' })
      .eq('id', messageId)
    await deleteSearchDocument('dm_message', messageId)
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
          const { data: callMsg } = await (supabase.from('dm_messages') as any)
            .insert({
              dm_id: dmId,
              sender_id: currentUser.id,
              content: `📞 音声通話を開始しました！参加する: ${data.url}`,
            })
            .select()
            .single()
          if (callMsg?.id) {
            await upsertSearchDocument({
              sourceType: 'dm_message',
              sourceId: callMsg.id,
              title: targetUser?.display_name || 'DM',
              content: '音声通話を開始しました',
              dmId: dmId,
              userId: currentUser.id,
              metadata: { targetUser: targetUser?.display_name || '' },
            })
          }
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

      <div className="h-full flex">
        <div className="flex-1 flex flex-col">
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
            messages.map((message) => {
              const isOwn = message.sender_id === currentUser?.id
              const reactions = reactionsMap[message.id] || []
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

                    <div className={`chat-message ${isOwn ? 'sent' : 'received'}`}>
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
          <form onSubmit={sendMessage} className="p-4 border-t-4 border-black bg-white space-y-3">
            <RichTextEditor
              ref={editorRef}
              value={newMessageHtml}
              onChange={(html, text) => {
                setNewMessageHtml(html)
                setNewMessageText(text)
              }}
              placeholder="メッセージを にゅうりょく..."
            />
            <div className="flex items-center gap-3">
              <VoiceInputButton
                onTranscript={(text) => editorRef.current?.insertText(`${text} `)}
              />
              <button
                type="submit"
                className="pixel-btn px-6"
                disabled={!newMessageText.trim()}
              >
                <span className="text-red-500">♥</span> 送信
              </button>
            </div>
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
              <p className="text-xs text-gray-500">
                {targetUser?.display_name || 'DM'}とのスレッド
              </p>
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
                        {reply.sender_id === currentUser?.id && !reply.is_deleted && (
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
