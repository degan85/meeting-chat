import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// 세션 상세 조회 (메시지 포함)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // 세션 확인
    const sessions: any[] = await db.$queryRaw`
      SELECT id, title, "meetingId", "createdAt"
      FROM chat_sessions
      WHERE id = ${id} AND "userId" = ${session.user.id}
    `

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 메시지 조회
    const messages: any[] = await db.$queryRaw`
      SELECT id, role, content, "createdAt"
      FROM chat_messages
      WHERE "sessionId" = ${id}
      ORDER BY "createdAt" ASC
    `

    return NextResponse.json({
      session: sessions[0],
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })
  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 세션 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    await db.$executeRaw`
      DELETE FROM chat_sessions
      WHERE id = ${id} AND "userId" = ${session.user.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
