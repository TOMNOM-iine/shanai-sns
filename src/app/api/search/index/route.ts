import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

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

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookies().getAll()
      },
      setAll() {},
    },
  })

  const body = await request.json()
  const action = body.action || 'upsert'

  if (action === 'delete') {
    const { sourceType, sourceId } = body
    if (!sourceType || !sourceId) {
      return NextResponse.json({ error: 'sourceType/sourceIdが必要です' }, { status: 400 })
    }
    const { error } = await supabase
      .from('search_documents')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const {
    sourceType,
    sourceId,
    title,
    content,
    channelId,
    dmId,
    userId,
    metadata,
  } = body

  if (!sourceType || !sourceId) {
    return NextResponse.json({ error: 'sourceType/sourceIdが必要です' }, { status: 400 })
  }

  let embedding: number[] | null = null
  const textForEmbedding = [title, content].filter(Boolean).join('\n').slice(0, 8000)

  if (process.env.OPENAI_API_KEY && textForEmbedding) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const embed = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: textForEmbedding,
      })
      embedding = embed.data[0]?.embedding || null
    } catch (error) {
      console.error('Embedding error:', error)
      embedding = null
    }
  }

  const { error } = await supabase.from('search_documents').upsert(
    {
      source_type: sourceType,
      source_id: sourceId,
      title: title || null,
      content: content || null,
      channel_id: channelId || null,
      dm_id: dmId || null,
      user_id: userId || null,
      metadata: metadata || {},
      embedding,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_type,source_id' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
