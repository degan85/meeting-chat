import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// 북마크 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bookmarks: any[] = await db.$queryRaw`
      SELECT id, question, answer, note, "createdAt"
      FROM bookmarks
      WHERE "userId" = ${session.user.id}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `

    return NextResponse.json({ bookmarks })
  } catch (error: any) {
    // 테이블이 없으면 빈 배열 반환
    if (error?.code === 'P2010' && error?.meta?.message?.includes('does not exist')) {
      return NextResponse.json({ bookmarks: [] })
    }
    console.error('Bookmarks API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 북마크 추가
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messageId, question, answer, note } = await request.json()
    
    if (!question || !answer) {
      return NextResponse.json({ error: 'Question and answer required' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const now = new Date()

    // 테이블이 없으면 생성 시도
    try {
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS bookmarks (
          id TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "messageId" TEXT,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          note TEXT,
          "createdAt" TIMESTAMP DEFAULT NOW()
        )
      `
      await db.$executeRaw`CREATE INDEX IF NOT EXISTS bookmarks_userId_idx ON bookmarks("userId")`
    } catch (e) {
      // 이미 존재하면 무시
    }

    await db.$executeRaw`
      INSERT INTO bookmarks (id, "userId", "messageId", question, answer, note, "createdAt")
      VALUES (${id}, ${session.user.id}, ${messageId || null}, ${question}, ${answer}, ${note || null}, ${now})
    `

    return NextResponse.json({ id, success: true })
  } catch (error) {
    console.error('Create bookmark error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
