import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* アンダーテイル風タイトル画面 */}
      <div className="ut-textbox max-w-2xl w-full text-center mb-8">
        <h1 className="text-4xl font-pixel mb-4">
          * 社内SNS へ ようこそ！
        </h1>
        <p className="text-lg">
          チームの コミュニケーション を<br />
          もっと たのしく。
        </p>
      </div>

      {/* メニュー */}
      <div className="space-y-4 w-full max-w-md">
        <Link href="/login" className="block">
          <button className="pixel-btn w-full text-xl py-4 flex items-center justify-center gap-3">
            <span className="text-red-500">♥</span>
            ログイン
          </button>
        </Link>

        <Link href="/register" className="block">
          <button className="pixel-btn w-full text-xl py-4 flex items-center justify-center gap-3">
            <span className="text-red-500">♥</span>
            アカウント作成
          </button>
        </Link>
      </div>

      {/* デコレーション */}
      <div className="mt-16 text-center font-pixel text-gray-500">
        <p>* determination で チームを つなげよう</p>
        <div className="mt-4 flex justify-center gap-4 text-2xl">
          <span className="animate-bounce-slow">★</span>
          <span className="animate-bounce-slow" style={{ animationDelay: '0.2s' }}>☆</span>
          <span className="animate-bounce-slow" style={{ animationDelay: '0.4s' }}>★</span>
        </div>
      </div>
    </main>
  )
}
