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
      SELECT id, question, answer, sources, note, "createdAt"
      FROM bookmarks
      WHERE "userId" = ${session.user.id}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `

    return NextResponse.json({ bookmarks })
  } catch (error) {
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

    const { messageId, question, answer, sources, note } = await request.json()
    
    if (!question || !answer) {
      return NextResponse.json({ error: 'Question and answer required' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const now = new Date()
    const sourcesJson = sources ? JSON.stringify(sources) : null

    await db.$executeRaw`
      INSERT INTO bookmarks (id, "userId", "messageId", question, answer, sources, note, "createdAt")
      VALUES (${id}, ${session.user.id}, ${messageId || null}, ${question}, ${answer}, ${sourcesJson}::jsonb, ${note || null}, ${now})
    `

    return NextResponse.json({ id, success: true })
  } catch (error) {
    console.error('Create bookmark error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
