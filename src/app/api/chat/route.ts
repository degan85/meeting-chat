/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchByVector, searchByKeyword, getProjectMeetingIds } from '@/lib/db'
import { checkMeetingAccess, getAccessibleMeetingIds } from '@/lib/meeting-access'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { message, meetingId, projectId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // 특정 회의가 선택된 경우 접근 권한 확인
    if (meetingId) {
      const hasAccess = await checkMeetingAccess(meetingId, userId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: '해당 회의에 접근 권한이 없습니다.' },
          { status: 403 }
        )
      }
    }

    // 접근 가능한 회의 ID 조회
    let accessibleMeetingIds = await getAccessibleMeetingIds(userId)

    // 프로젝트가 선택된 경우 해당 프로젝트의 회의만 필터링
    if (projectId) {
      const projectMeetings = await getProjectMeetingIds(projectId)
      accessibleMeetingIds = accessibleMeetingIds.filter(id => projectMeetings.includes(id))
    }

    console.log(`💬 [Chat] Query: "${message.slice(0, 50)}..." | Meeting: ${meetingId || 'all'} | Project: ${projectId || 'all'} | User: ${userId}`)

    // 1. 벡터 검색
    const searchResults = (await searchTranscripts(message, accessibleMeetingIds, meetingId)) as any[]

    console.log(`🔍 [Chat] Found ${searchResults.length} relevant chunks`)

    // 2. 검색 결과가 없으면 안내 메시지
    if (searchResults.length === 0) {
      return NextResponse.json({
        response: '관련된 회의 내용을 찾을 수 없습니다. 다른 키워드로 질문해 주세요.',
        sources: []
      })
    }

    // 3. 컨텍스트 구성
    const context = buildContext(searchResults)

    // 4. Claude Sonnet으로 응답 생성
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `당신은 회의 전사 내용을 분석하는 AI 어시스턴트입니다.

## 규칙
1. 아래 "검색된 회의 내용"에 있는 정보만 사용하세요.
2. 검색 결과에 없는 내용은 절대 지어내지 마세요.
3. 정보를 찾을 수 없으면 "해당 내용을 찾을 수 없습니다"라고 답하세요.
4. 답변은 한국어로 간결하게 작성하세요.
5. 가능하면 출처(회의명, 날짜)를 언급하세요.

## 검색된 회의 내용
${context}

## 사용자 질문
${message}

위 검색 결과를 바탕으로 답변해주세요.`
        }
      ]
    })

    const aiResponse = response.content[0].type === 'text'
      ? response.content[0].text
      : '응답을 생성할 수 없습니다.'

    // 5. 출처 정보 구성
    const sources = searchResults.slice(0, 3).map((r: any) => ({
      title: r.meetingTitle || r.entityType || '회의',
      content: r.content.slice(0, 150) + '...'
    }))

    return NextResponse.json({
      response: aiResponse,
      sources
    })

  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

async function searchTranscripts(
  searchQuery: string,
  accessibleMeetingIds: string[],
  meetingId?: string
): Promise<any[]> {
  try {
    // OpenAI 임베딩 생성
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: searchQuery
      })
    })

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.data?.[0]?.embedding

    if (!embedding) {
      console.error('Failed to generate embedding')
      return fallbackKeywordSearch(searchQuery, accessibleMeetingIds, meetingId)
    }

    // 벡터 검색
    const results = (await searchByVector(embedding, accessibleMeetingIds, meetingId)) as any[]

    // 높은 유사도만 필터링 (0.65 이상)
    const filtered = results.filter((r: any) => r.similarity >= 0.65)

    console.log(`📊 [Search] Vector search: ${results.length} total, ${filtered.length} high-similarity (>=0.65)`)

    // 유사도 높은 결과가 없으면 키워드 검색 시도
    if (filtered.length === 0) {
      return fallbackKeywordSearch(searchQuery, accessibleMeetingIds, meetingId)
    }

    return filtered

  } catch (error) {
    console.error('Vector search error:', error)
    return fallbackKeywordSearch(searchQuery, accessibleMeetingIds, meetingId)
  }
}

async function fallbackKeywordSearch(
  searchQuery: string,
  accessibleMeetingIds: string[],
  meetingId?: string
): Promise<any[]> {
  console.log('🔤 [Search] Falling back to keyword search')

  // 한글 키워드 추출 (2자 이상)
  const keywords = searchQuery
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .slice(0, 5)

  if (keywords.length === 0) return []

  const results = (await searchByKeyword(keywords, accessibleMeetingIds, meetingId)) as any[]
  return results
}

function buildContext(results: any[]) {
  if (results.length === 0) return '검색된 내용 없음'

  // 회의별로 그룹화
  const byMeeting: Record<string, any[]> = {}
  results.forEach(r => {
    const key = r.entityId || 'unknown'
    if (!byMeeting[key]) byMeeting[key] = []
    byMeeting[key].push(r)
  })

  let context = ''
  Object.values(byMeeting).forEach(chunks => {
    const first = chunks[0]
    const date = first.meetingDate ? new Date(first.meetingDate).toLocaleDateString('ko-KR') : ''
    const title = first.meetingTitle || first.entityType || '회의'
    context += `\n### ${title} ${date ? `(${date})` : ''}\n`

    chunks.forEach((chunk: any) => {
      context += `${chunk.content}\n`
    })
  })

  return context
}
