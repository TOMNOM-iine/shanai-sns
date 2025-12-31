import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

interface SearchSource {
  rank: number
  sourceType: string
  sourceId: string
  title: string | null
  content: string | null
  metadata: Record<string, unknown> | null
  similarity: number
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Supabase設定が不足しています' }, { status: 500 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEYが未設定です' }, { status: 400 })
  }

  const { query, limit = 20 } = await request.json()
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'queryが必要です' }, { status: 400 })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const embed = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query.slice(0, 1000),
  })
  const queryEmbedding = embed.data[0]?.embedding
  if (!queryEmbedding) {
    return NextResponse.json({ error: '埋め込み生成に失敗しました' }, { status: 500 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookies().getAll()
      },
      setAll() {},
    },
  })

  const { data: matches, error } = await supabase.rpc('match_search_documents', {
    query_embedding: queryEmbedding,
    match_count: limit,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sources: SearchSource[] = (matches || []).map((item: Record<string, unknown>, index: number) => ({
    rank: index + 1,
    sourceType: String(item.source_type || ''),
    sourceId: String(item.source_id || ''),
    title: item.title as string | null,
    content: item.content as string | null,
    metadata: item.metadata as Record<string, unknown> | null,
    similarity: Number(item.similarity) || 0,
  }))

  const prompt = `あなたは社内SNSの検索アシスタントです。
以下の検索結果をもとに、ユーザーの質問に日本語で簡潔に回答してください。
必要なら要点を箇条書きにし、引用元（チャンネル名やファイル名）が分かるように触れてください。

質問:
${query}

検索結果:
${sources
  .map(
    (s) =>
      `- [${s.sourceType}] ${s.title || ''} :: ${String(s.content || '').slice(0, 300)}`
  )
  .join('\n')}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'あなたは社内SNSの検索アシスタントです。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 400,
    temperature: 0.2,
  })

  const answer = completion.choices[0]?.message?.content || '回答を生成できませんでした。'

  return NextResponse.json({ answer, sources })
}
