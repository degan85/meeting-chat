/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getMeetings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const meetings = (await getMeetings()) as any[]
    
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
