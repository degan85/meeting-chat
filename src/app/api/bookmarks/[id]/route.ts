import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// 북마크 삭제
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
      DELETE FROM bookmarks
      WHERE id = ${id} AND "userId" = ${session.user.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete bookmark error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
