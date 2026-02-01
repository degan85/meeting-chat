import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActionItemsForChat, formatActionItemsForContext } from '@/lib/action-items'

export const dynamic = 'force-dynamic'

/**
 * GET /api/action-items
 * 
 * Query params:
 * - projectId: 특정 프로젝트의 액션 아이템만 조회
 * - meetingId: 특정 회의의 액션 아이템만 조회
 * - status: 'all' | 'todo' | 'done'
 * - mine: 'true' | 'false' - 본인 담당만 조회
 * - format: 'json' | 'markdown' - 응답 형식
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined
    const meetingId = searchParams.get('meetingId') || undefined
    const status = (searchParams.get('status') as 'all' | 'todo' | 'done') || 'all'
    const mine = searchParams.get('mine') === 'true'
    const format = searchParams.get('format') || 'json'

    const items = await getActionItemsForChat(session.user.id, {
      projectId,
      meetingId,
      status,
      assigneeOnly: mine
    })

    if (format === 'markdown') {
      const markdown = formatActionItemsForContext(items)
      return NextResponse.json({ markdown, count: items.length })
    }

    // 통계 계산
    const stats = {
      total: items.length,
      todo: items.filter(i => i.status !== 'done').length,
      done: items.filter(i => i.status === 'done').length,
      convertedToTask: items.filter(i => i.convertedToType === 'task').length,
      convertedToIssue: items.filter(i => i.convertedToType === 'issue').length,
      unassigned: items.filter(i => !i.assigneeName).length
    }

    return NextResponse.json({
      items,
      stats,
      count: items.length
    })

  } catch (error) {
    console.error('Action Items API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
