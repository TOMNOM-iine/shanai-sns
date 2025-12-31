import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function ChannelsPage() {
  const supabase = await createClient()

  const { data: channels } = await supabase
    .from('channels')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="h-full flex flex-col p-8">
      {/* ヘッダー */}
      <div className="ut-textbox mb-8">
        <h1 className="text-2xl font-pixel">* ようこそ！</h1>
        <p className="mt-2">
          チャンネルを えらんで かいわを はじめよう
        </p>
      </div>

      {/* チャンネル一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels?.map((channel) => (
          <Link
            key={channel.id}
            href={`/channels/${channel.id}`}
            className="sketch-border bg-white p-6 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl group-hover:animate-wiggle">#</span>
              <div>
                <h2 className="font-pixel text-lg">{channel.name}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {channel.description || 'チャンネルの説明がありません'}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* デコレーション */}
      <div className="mt-auto pt-8 text-center font-pixel text-gray-400">
        <p>* チームワークで determination を たかめよう！</p>
        <div className="mt-4 flex justify-center gap-2">
          {'★☆★☆★'.split('').map((star, i) => (
            <span
              key={i}
              className="animate-bounce-slow"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {star}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
