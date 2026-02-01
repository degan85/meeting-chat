/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMeetings, getProjectMeetingIds } from '@/lib/db'
import { getAccessibleMeetingIds } from '@/lib/meeting-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    // 프로젝트 ID 파라미터 확인
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // 접근 가능한 회의 ID 조회
    let accessibleMeetingIds = await getAccessibleMeetingIds(session.user.id)

    // 프로젝트가 선택된 경우 해당 프로젝트 회의만 필터링
    if (projectId) {
      const projectMeetings = await getProjectMeetingIds(projectId)
      accessibleMeetingIds = accessibleMeetingIds.filter(id => projectMeetings.includes(id))
    }

    // 접근 가능한 회의 목록 조회
    const meetings = (await getMeetings(accessibleMeetingIds)) as any[]

    return NextResponse.json({
      meetings: meetings.map((m: any) => ({
        id: m.id,
        title: m.title || '제목 없음',
        createdAt: m.createdAt
      }))
    })
  } catch (error: any) {
    console.error('Meetings API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch meetings', details: error?.message },
      { status: 500 }
    )
  }
}
