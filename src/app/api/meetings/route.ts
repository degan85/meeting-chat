/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMeetings } from '@/lib/db'
import { getAccessibleMeetingIds } from '@/lib/meeting-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    // 접근 가능한 회의 ID 조회
    const accessibleMeetingIds = await getAccessibleMeetingIds(session.user.id)

    // 접근 가능한 회의 목록 조회
    const meetings = (await getMeetings(accessibleMeetingIds)) as any[]

    return NextResponse.json({
      meetings: meetings.map((m: any) => ({
        id: m.id,
        title: m.title || '제목 없음',
        date: m.createdAt
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
