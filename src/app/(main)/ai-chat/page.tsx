'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '* やあ！ ぼくは AIアシスタントだよ。\n\n社内の データを もとに しつもんに こたえるよ。\nなんでも きいてね！',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchContext = async () => {
    // 最新のメッセージを取得してコンテキストとする
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, created_at, profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(50)

    // 最新のタスクを取得
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title, description, status, due_date, profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(20)

    // 最新のイベントを取得
    const { data: events } = await supabase
      .from('events')
      .select('title, description, start_time, end_time')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(10)

    return { recentMessages, tasks, events }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // コンテキストを取得
      const context = await fetchContext()

      // APIにリクエスト
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context,
          history: messages.slice(-10),
        }),
      })

      const data = await response.json()

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '* ごめんね... エラーが おきちゃった。\nもういちど ためしてみてね。',
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response },
        ])
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '* つうしん エラーが おきたみたい...\nネットワークを かくにんしてね。',
        },
      ])
    }

    setLoading(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <header className="p-4 border-b-4 border-black bg-black text-white">
        <div className="flex items-center gap-3">
          <span className="text-2xl animate-bounce-slow">🤖</span>
          <div>
            <h1 className="font-pixel text-xl">AIアシスタント</h1>
            <p className="text-sm text-gray-400">
              社内データをもとに おこたえします
            </p>
          </div>
        </div>
      </header>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-100">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-3 ${
              message.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {/* アバター */}
            <div
              className={`w-10 h-10 flex items-center justify-center font-pixel pixel-avatar flex-shrink-0 ${
                message.role === 'assistant'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-black text-white'
              }`}
            >
              {message.role === 'assistant' ? '★' : 'U'}
            </div>

            {/* メッセージ */}
            <div
              className={`max-w-[70%] p-4 ${
                message.role === 'assistant' ? 'ut-textbox' : 'sketch-border bg-white'
              }`}
            >
              <p className="whitespace-pre-wrap font-pixel">
                {message.content}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-yellow-400 text-black flex items-center justify-center font-pixel pixel-avatar animate-pulse">
              ★
            </div>
            <div className="ut-textbox">
              <p className="font-pixel loading-text">かんがえ中</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <form onSubmit={sendMessage} className="p-4 border-t-4 border-black bg-white">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="AIに しつもんする..."
            className="hand-input flex-1 text-lg"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="pixel-btn px-6 disabled:opacity-50"
          >
            <span className="text-yellow-500">★</span> 送信
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500 font-pixel">
          * 社内の メッセージ、タスク、イベント を もとに こたえるよ
        </div>
      </form>
    </div>
  )
}
