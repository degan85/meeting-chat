import type { Metadata } from 'next'
import SessionProvider from '@/components/providers/SessionProvider'
import './globals.css'

export const metadata: Metadata = {
  title: '미팅챗 - 회의 내용과 대화하기',
  description: 'AI와 함께 회의 내용을 검색하고 분석하세요',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-white min-h-screen">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
