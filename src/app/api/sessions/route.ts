import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// 세션 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessions: any[] = await db.$queryRaw`
      SELECT 
        cs.id,
        cs.title,
        cs."meetingId",
        cs."projectId",
        cs."createdAt",
        cs."lastMessageAt",
        (SELECT content FROM chat_messages WHERE "sessionId" = cs.id ORDER BY "createdAt" ASC LIMIT 1) as "firstMessage"
      FROM chat_sessions cs
      WHERE cs."userId" = ${session.user.id}
      ORDER BY COALESCE(cs."lastMessageAt", cs."createdAt") DESC
      LIMIT 50
    `

    return NextResponse.json({
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title || s.firstMessage?.slice(0, 30) + '...' || '새 대화',
        meetingId: s.meetingId,
        projectId: s.projectId,
        createdAt: s.createdAt,
        lastMessageAt: s.lastMessageAt
      }))
    })
  } catch (error) {
    console.error('Sessions API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 새 세션 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { meetingId, projectId } = await request.json()
    const id = crypto.randomUUID()
    const now = new Date()

    await db.$executeRaw`
      INSERT INTO chat_sessions (id, "userId", "meetingId", "projectId", "createdAt", "updatedAt")
      VALUES (${id}, ${session.user.id}, ${meetingId || null}, ${projectId || null}, ${now}, ${now})
    `

    return NextResponse.json({ sessionId: id })
  } catch (error) {
    console.error('Create session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
