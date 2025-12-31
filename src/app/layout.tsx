import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '社内SNS - UNDERTALE風コミュニケーション',
  description: 'チームのためのコミュニケーションツール',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="bg-white text-black min-h-screen">
        {children}
      </body>
    </html>
  )
}
