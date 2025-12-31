import { NextRequest, NextResponse } from 'next/server'

// ルーム名をサニタイズ（英数字とハイフン、アンダースコアのみ許可）
function sanitizeRoomName(name: string): string {
  // 日本語などをローマ字風のIDに変換
  const sanitized = name
    .replace(/[^a-zA-Z0-9\-_]/g, '') // 英数字以外を削除
    || 'room' // 空になった場合のフォールバック
  return sanitized.slice(0, 30) // 最大30文字
}

export async function POST(request: NextRequest) {
  try {
    const { roomName } = await request.json()

    const apiKey = process.env.DAILY_API_KEY

    if (!apiKey || apiKey.trim() === '') {
      // APIキーがない場合はエラーを返す
      return NextResponse.json({
        error: 'Daily.co APIキーが設定されていません。.env.localにDAILY_API_KEYを設定してください。',
        setupUrl: 'https://dashboard.daily.co/developers',
      }, { status: 400 })
    }

    // ルーム名をサニタイズ
    const safeName = sanitizeRoomName(roomName)

    // Daily.co APIでルームを作成
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: `${safeName}-${Date.now()}`,
        properties: {
          enable_screenshare: true,
          enable_chat: true,
          max_participants: 50,
          exp: Math.floor(Date.now() / 1000) + 3600, // 1時間後に期限切れ
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Daily.co API error:', error)
      throw new Error('Failed to create room')
    }

    const room = await response.json()

    return NextResponse.json({
      url: room.url,
      name: room.name,
      isDemo: false,
    })
  } catch (error) {
    console.error('Meeting creation error:', error)
    return NextResponse.json(
      { error: 'ミーティングルームの作成に失敗しました' },
      { status: 500 }
    )
  }
}
