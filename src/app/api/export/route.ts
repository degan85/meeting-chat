import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// 대화 내보내기 (마크다운)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId, format = 'markdown' } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    // 세션 확인
    const sessions: any[] = await db.$queryRaw`
      SELECT id, title, "createdAt"
      FROM chat_sessions
      WHERE id = ${sessionId} AND "userId" = ${session.user.id}
    `

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const chatSession = sessions[0]

    // 메시지 조회
    const messages: any[] = await db.$queryRaw`
      SELECT role, content, "createdAt"
      FROM chat_messages
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" ASC
    `

    if (format === 'markdown') {
      const markdown = generateMarkdown(chatSession, messages)
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(chatSession.title || '대화')}.md"`
        }
      })
    }

    // JSON 형식
    return NextResponse.json({
      session: chatSession,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        sources: m.sources,
        createdAt: m.createdAt
      }))
    })

  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateMarkdown(session: any, messages: any[]): string {
  const date = new Date(session.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  let md = `# ${session.title || '대화'}\n\n`
  md += `📅 ${date}\n\n`
  md += `---\n\n`

  messages.forEach((msg, i) => {
    if (msg.role === 'user') {
      md += `## 💬 질문\n\n`
      md += `${msg.content}\n\n`
    } else {
      md += `## 🤖 답변\n\n`
      md += `${msg.content}\n\n`

      if (msg.sources && msg.sources.length > 0) {
        md += `### 📄 참고 자료\n\n`
        msg.sources.forEach((src: any, j: number) => {
          md += `${j + 1}. **${src.title}**\n`
          md += `   ${src.content}\n\n`
        })
      }
    }

    if (i < messages.length - 1) {
      md += `---\n\n`
    }
  })

  md += `\n---\n\n`
  md += `*미팅챗에서 내보냄*`

  return md
}
