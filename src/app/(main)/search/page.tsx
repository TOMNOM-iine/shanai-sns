'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { stripHtml } from '@/lib/text/stripHtml'
import type { Profile } from '@/types/database'

interface MessageResult {
  id: string
  content: string
  created_at: string
  channel_id: string
  profiles?: { display_name: string | null }
  channels?: { name: string | null }
}

interface DmResult {
  id: string
  content: string
  created_at: string
  dm_id: string
  sender_id: string
  profiles?: { display_name: string | null }
  direct_messages?: { user1_id: string; user2_id: string }
}

interface FileResult {
  id: string
  name: string
  mime_type: string
  created_at: string
}

interface TaskResult {
  id: string
  title: string
  description: string | null
  created_at: string
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<MessageResult[]>([])
  const [dms, setDms] = useState<DmResult[]>([])
  const [files, setFiles] = useState<FileResult[]>([])
  const [tasks, setTasks] = useState<TaskResult[]>([])
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiSources, setAiSources] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile }) => setCurrentUser(profile || null))
      }
    })
  }, [])

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setAiAnswer(null)
    setAiSources([])

    const [{ data: msgData }, { data: dmData }, { data: fileData }, { data: taskData }] =
      await Promise.all([
        supabase
          .from('messages')
          .select('id, content, created_at, channel_id, profiles:user_id(display_name), channels(name)')
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('dm_messages')
          .select('id, content, created_at, dm_id, sender_id, profiles:sender_id(display_name), direct_messages(user1_id,user2_id)')
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('files')
          .select('id, name, mime_type, created_at')
          .ilike('name', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('tasks')
          .select('id, title, description, created_at')
          .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

    setMessages((msgData || []) as unknown as MessageResult[])
    setDms((dmData || []) as unknown as DmResult[])
    setFiles((fileData || []) as unknown as FileResult[])
    setTasks((taskData || []) as unknown as TaskResult[])
    setLoading(false)
  }

  const runAiSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setAiAnswer(null)

    const res = await fetch('/api/ai-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, limit: 20 }),
    })
    const data = await res.json()
    if (data.answer) {
      setAiAnswer(data.answer)
      setAiSources(data.sources || [])
    }
    setLoading(false)
  }

  const getDmLink = (dm: DmResult) => {
    if (!currentUser || !dm.direct_messages) return '/dm'
    const otherId =
      dm.direct_messages.user1_id === currentUser.id
        ? dm.direct_messages.user2_id
        : dm.direct_messages.user1_id
    return `/dm/${otherId}`
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="ut-textbox mb-6">
        <h1 className="text-2xl font-pixel">* 検索</h1>
        <p className="mt-2">チャンネル / DM / ファイル / タスク を横断検索</p>
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードを入力..."
          className="hand-input flex-1 text-lg"
        />
        <button onClick={runSearch} className="pixel-btn">
          検索
        </button>
        <button onClick={runAiSearch} className="pixel-btn bg-yellow-100">
          AIで検索
        </button>
      </div>

      {loading && (
        <div className="ut-textbox mb-6">
          <p className="font-pixel loading-text">検索中...</p>
        </div>
      )}

      {aiAnswer && (
        <div className="sketch-border bg-white p-4 mb-6">
          <h2 className="font-pixel text-lg mb-2">AIまとめ</h2>
          <p className="whitespace-pre-wrap text-sm">{aiAnswer}</p>
          {aiSources.length > 0 && (
            <div className="mt-3 text-xs text-gray-600">
              参照: {aiSources.slice(0, 5).map((s) => s.title || s.sourceType).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sketch-border bg-white p-4">
          <h2 className="font-pixel text-lg mb-3">チャンネルメッセージ</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500">該当なし</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <Link key={msg.id} href={`/channels/${msg.channel_id}`} className="block">
                  <div className="border-2 border-black p-3 hover:bg-gray-50">
                    <div className="text-xs text-gray-500">
                      #{msg.channels?.name || 'channel'}
                    </div>
                    <div className="text-sm font-pixel">
                      {stripHtml(msg.content).slice(0, 120)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="sketch-border bg-white p-4">
          <h2 className="font-pixel text-lg mb-3">DM</h2>
          {dms.length === 0 ? (
            <p className="text-sm text-gray-500">該当なし</p>
          ) : (
            <div className="space-y-3">
              {dms.map((dm) => (
                <Link key={dm.id} href={getDmLink(dm)} className="block">
                  <div className="border-2 border-black p-3 hover:bg-gray-50">
                    <div className="text-xs text-gray-500">
                      {dm.profiles?.display_name || 'DM'}
                    </div>
                    <div className="text-sm font-pixel">
                      {stripHtml(dm.content).slice(0, 120)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="sketch-border bg-white p-4">
          <h2 className="font-pixel text-lg mb-3">ファイル</h2>
          {files.length === 0 ? (
            <p className="text-sm text-gray-500">該当なし</p>
          ) : (
            <div className="space-y-3">
              {files.map((file) => (
                <Link key={file.id} href="/files" className="block">
                  <div className="border-2 border-black p-3 hover:bg-gray-50">
                    <div className="text-sm font-pixel">{file.name}</div>
                    <div className="text-xs text-gray-500">{file.mime_type}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="sketch-border bg-white p-4">
          <h2 className="font-pixel text-lg mb-3">タスク</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500">該当なし</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Link key={task.id} href="/tasks" className="block">
                  <div className="border-2 border-black p-3 hover:bg-gray-50">
                    <div className="text-sm font-pixel">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-gray-500">
                        {task.description.slice(0, 80)}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
