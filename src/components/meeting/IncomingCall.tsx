'use client'

import { useState, useEffect } from 'react'

interface IncomingCallProps {
  callerName: string
  channelName: string
  onAccept: () => void
  onDecline: () => void
}

export default function IncomingCall({
  callerName,
  channelName,
  onAccept,
  onDecline,
}: IncomingCallProps) {
  const [isRinging, setIsRinging] = useState(true)

  useEffect(() => {
    // 30秒後に自動で着信拒否
    const timeout = setTimeout(() => {
      onDecline()
    }, 30000)

    // 着信音のアニメーション
    const interval = setInterval(() => {
      setIsRinging((prev) => !prev)
    }, 500)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [onDecline])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
      <div className="bg-white sketch-border p-8 max-w-md w-full mx-4 text-center">
        {/* 着信アイコン */}
        <div
          className={`text-6xl mb-4 transition-transform ${
            isRinging ? 'scale-110' : 'scale-100'
          }`}
        >
          📞
        </div>

        {/* 発信者情報 */}
        <h2 className="font-pixel text-2xl mb-2">着信中...</h2>
        <p className="text-lg mb-1">
          <span className="font-pixel">{callerName}</span> さんから
        </p>
        <p className="text-gray-600 mb-6">
          #{channelName} のミーティングに招待されています
        </p>

        {/* ボタン */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={onDecline}
            className="pixel-btn bg-red-100 hover:bg-red-500 hover:text-white px-8 py-3 text-lg"
          >
            ✕ 拒否
          </button>
          <button
            onClick={onAccept}
            className="pixel-btn bg-green-100 hover:bg-green-500 hover:text-white px-8 py-3 text-lg animate-pulse"
          >
            ✓ 参加
          </button>
        </div>

        {/* カウントダウン */}
        <p className="text-sm text-gray-400 mt-4">
          30秒後に自動的に拒否されます
        </p>
      </div>
    </div>
  )
}
