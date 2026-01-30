import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 사용자가 접근 가능한 프로젝트 목록
    const projects: any[] = await db.$queryRaw`
      SELECT DISTINCT p.id, p.name, p.color, p."createdAt"
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm."projectId"
      WHERE p."ownerId" = ${session.user.id}
         OR pm."userId" = ${session.user.id}
      ORDER BY p."createdAt" DESC
    `

    return NextResponse.json({
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        createdAt: p.createdAt
      }))
    })
  } catch (error) {
    console.error('Projects API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
