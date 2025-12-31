import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    // APIキーチェック
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        response: '* AIアシスタントは まだ せっていされていないよ。\n\n.env.local に OPENAI_API_KEY を せっていしてね！',
      })
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const { message, context, history } = await request.json()

    // コンテキストをテキストに変換
    let contextText = ''

    if (context.recentMessages?.length > 0) {
      contextText += '【最近のチャットメッセージ】\n'
      context.recentMessages.forEach((msg: any) => {
        contextText += `- ${msg.profiles?.display_name || '不明'}: ${msg.content}\n`
      })
      contextText += '\n'
    }

    if (context.tasks?.length > 0) {
      contextText += '【現在のタスク】\n'
      context.tasks.forEach((task: any) => {
        const status =
          task.status === 'todo'
            ? '未着手'
            : task.status === 'in_progress'
            ? '進行中'
            : '完了'
        contextText += `- [${status}] ${task.title}`
        if (task.profiles?.display_name) {
          contextText += ` (担当: ${task.profiles.display_name})`
        }
        if (task.due_date) {
          contextText += ` (期限: ${task.due_date})`
        }
        contextText += '\n'
      })
      contextText += '\n'
    }

    if (context.events?.length > 0) {
      contextText += '【今後の予定】\n'
      context.events.forEach((event: any) => {
        const startDate = new Date(event.start_time).toLocaleDateString('ja-JP')
        const startTime = new Date(event.start_time).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        })
        contextText += `- ${event.title} (${startDate} ${startTime})\n`
      })
      contextText += '\n'
    }

    // 会話履歴を準備
    const conversationHistory = history.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }))

    const systemPrompt = `あなたは社内SNSのAIアシスタントです。アンダーテイル風の親しみやすい口調で返答してください。

以下の点に注意してください：
- ひらがなを多めに使い、親しみやすく話す
- 「*」を文頭に使ってアンダーテイル風にする
- 社内のデータ（チャット、タスク、イベント）を参照して具体的に回答する
- 短めの文で、読みやすく返答する
- 励ましの言葉を適度に入れる

【社内データコンテキスト】
${contextText || 'まだ社内データがありません。'}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const aiResponse = response.choices[0]?.message?.content || '* えっと... うまく こたえられなかった みたい。'

    return NextResponse.json({ response: aiResponse })
  } catch (error) {
    console.error('AI Chat Error:', error)
    return NextResponse.json(
      { error: 'AI処理中にエラーが発生しました' },
      { status: 500 }
    )
  }
}
