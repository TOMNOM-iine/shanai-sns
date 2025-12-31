import { NextResponse } from 'next/server'

// 常にランタイムで実行（ビルド時に静的化しない）
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  // 複数の環境変数名をチェック（Railway/Vercel/その他の互換性）
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''

  // デバッグ用
  console.log('Config API called:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlLength: supabaseUrl.length,
    keyLength: supabaseAnonKey.length,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
  })

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    debug: {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
    }
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  })
}
