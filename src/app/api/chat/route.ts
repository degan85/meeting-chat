/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, searchByVector, searchByKeyword, getProjectMeetingIds } from '@/lib/db'
import { checkMeetingAccess, getAccessibleMeetingIds } from '@/lib/meeting-access'
import { 
  detectActionItemIntent, 
  parseStatusFilter, 
  getAllTasksAndActionItems, 
  formatAllForContext 
} from '@/lib/action-items'
import {
  detectDocumentIntent,
  searchDocuments,
  formatDocumentsForContext
} from '@/lib/document-search'
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
    const { message, meetingId, projectId, sessionId, searchSource } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // 세션 ID 처리 (없으면 새로 생성)
    let currentSessionId = sessionId
    const now = new Date()
    
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID()
      await db.$executeRaw`
        INSERT INTO chat_sessions (id, "userId", "meetingId", "createdAt", "updatedAt", "lastMessageAt")
        VALUES (${currentSessionId}, ${userId}, ${meetingId || null}, ${now}, ${now}, ${now})
      `
    } else {
      // 기존 세션 업데이트
      await db.$executeRaw`
        UPDATE chat_sessions SET "lastMessageAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${currentSessionId}
      `
    }

    // 사용자 메시지 저장
    const userMsgId = crypto.randomUUID()
    await db.$executeRaw`
      INSERT INTO chat_messages (id, "sessionId", role, content, "createdAt")
      VALUES (${userMsgId}, ${currentSessionId}, 'user', ${message}, ${now})
    `

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

    // Schedule Manager에서 프로젝트/참석자 컨텍스트 가져오기
    let scheduleContext: any = null
    const scheduleManagerUrl = process.env.SCHEDULE_MANAGER_URL
    console.log(`📋 [Chat] Schedule Manager URL: ${scheduleManagerUrl ? 'set' : 'NOT SET'}, meetingId: ${meetingId || 'none'}, projectId: ${projectId || 'none'}`)
    
    if (scheduleManagerUrl) {
      // meetingId가 있으면 해당 미팅 컨텍스트 조회
      if (meetingId) {
        try {
          const contextRes = await fetch(
            `${scheduleManagerUrl}/api/meeting-schedules/by-meeting/${meetingId}`,
            { 
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store'
            }
          )
          if (contextRes.ok) {
            const data = await contextRes.json()
            if (data.found) {
              scheduleContext = data
              console.log(`📋 [Chat] Loaded meeting context: ${data.attendees?.length || 0} attendees`)
            }
          }
        } catch (error) {
          console.log(`⚠️ [Chat] Schedule Manager meeting fetch failed:`, error)
        }
      }
      
      // projectId가 있고 meetingId 컨텍스트가 없으면 프로젝트 참여자 조회
      if (projectId && !scheduleContext) {
        try {
          const contextRes = await fetch(
            `${scheduleManagerUrl}/api/projects/${projectId}/context`,
            { 
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store'
            }
          )
          if (contextRes.ok) {
            const data = await contextRes.json()
            if (data.found) {
              scheduleContext = {
                found: true,
                project: data.project,
                attendees: data.participants || [],
                departments: data.companies?.flatMap((c: any) => 
                  (c.departments || []).map((d: any) => ({ ...d, company: c.name }))
                ) || []
              }
              console.log(`📋 [Chat] Loaded project context: ${data.participants?.length || 0} participants`)
            }
          }
        } catch (error) {
          console.log(`⚠️ [Chat] Schedule Manager project fetch failed:`, error)
        }
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

    // ========================================
    // 의도 감지 (모두 체크) + 검색 소스 필터
    // ========================================
    const isTaskQuery = detectActionItemIntent(message)
    const isDocumentQuery = detectDocumentIntent(message)
    
    // 강한 의도 감지 (명시적 키워드)
    const isStrongTaskIntent = /^(태스크|할\s*일|todo|미완료|진행.?중|완료.?된)/i.test(message.trim())
    const isStrongDocIntent = /^(문서|파일|자료|첨부|업로드)/i.test(message.trim())
    
    // 검색 소스 필터 적용
    const shouldSearchMeeting = !searchSource || searchSource === 'meeting'
    const shouldSearchTask = !searchSource || searchSource === 'task' || isTaskQuery
    const shouldSearchDocument = !searchSource || searchSource === 'document' || isDocumentQuery
    
    console.log(`🔍 [Chat] Intent: task=${isTaskQuery}, doc=${isDocumentQuery} | Filter: meeting=${shouldSearchMeeting}, task=${shouldSearchTask}, doc=${shouldSearchDocument}`)

    // ========================================
    // 태스크/액션 아이템 검색
    // ========================================
    let taskContext = ''
    let taskCount = 0
    
    // 검색 소스가 'task'이거나, 필터 없이 태스크 의도 감지 시
    if (shouldSearchTask && (isTaskQuery || searchSource === 'task')) {
      console.log(`📋 [Chat] Searching tasks...`)
      
      const statusFilter = parseStatusFilter(message)
      const assigneeOnly = message.includes('내') || message.includes('나의') || message.includes('담당')
      
      const { tasks, actionItems } = await getAllTasksAndActionItems(userId, {
        projectId: projectId || undefined,
        meetingId: meetingId || undefined,
        status: statusFilter,
        assigneeOnly
      })
      
      taskCount = tasks.length + actionItems.length
      console.log(`📋 [Chat] Found ${tasks.length} tasks, ${actionItems.length} action items`)
      
      if (taskCount > 0) {
        taskContext = formatAllForContext(tasks, actionItems)
      }
    }

    // ========================================
    // 문서 검색
    // ========================================
    let documentContext = ''
    let docCount = 0
    
    // 검색 소스가 'document'이거나, 필터 없이 문서 의도 감지 시
    if (shouldSearchDocument && (isDocumentQuery || searchSource === 'document')) {
      console.log(`📄 [Chat] Searching documents...`)
      
      const docResults = await searchDocuments(message)
      docCount = docResults.length
      
      if (docCount > 0) {
        console.log(`📄 [Chat] Found ${docCount} documents`)
        documentContext = formatDocumentsForContext(docResults)
      }
    }

    // ========================================
    // 벡터 검색 (회의 내용)
    // ========================================
    let searchResults: any[] = []
    if (shouldSearchMeeting) {
      searchResults = (await searchTranscripts(message, accessibleMeetingIds, meetingId)) as any[]
      console.log(`🎤 [Chat] Found ${searchResults.length} meeting chunks`)
    }

    // 검색 결과도 없고 태스크/액션 아이템도 없고 문서도 없으면 안내 메시지
    if (searchResults.length === 0 && !taskContext && !documentContext) {
      const noResultMsg = '관련된 회의 내용을 찾을 수 없습니다. 다른 키워드로 질문해 주세요.'
      const noResultMsgId = crypto.randomUUID()
      await db.$executeRaw`
        INSERT INTO chat_messages (id, "sessionId", role, content, "createdAt")
        VALUES (${noResultMsgId}, ${currentSessionId}, 'assistant', ${noResultMsg}, ${new Date()})
      `
      return NextResponse.json({
        response: noResultMsg,
        sources: [],
        sessionId: currentSessionId
      })
    }

    // ========================================
    // 컨텍스트 구성
    // ========================================
    const meetingContext = buildContext(searchResults)
    
    // 통합 컨텍스트 (회의 내용 + 액션 아이템 + 문서 + 참석자)
    let fullContext = ''
    
    // Schedule Manager 참석자/프로젝트 정보
    if (scheduleContext) {
      fullContext += `## 미팅 정보\n`
      if (scheduleContext.schedule) {
        fullContext += `- 제목: ${scheduleContext.schedule.title}\n`
        fullContext += `- 일시: ${scheduleContext.schedule.date} ${scheduleContext.schedule.time}\n`
        if (scheduleContext.schedule.location) {
          fullContext += `- 장소: ${scheduleContext.schedule.location}\n`
        }
      }
      if (scheduleContext.project) {
        fullContext += `\n## 프로젝트\n`
        fullContext += `- 이름: ${scheduleContext.project.name}\n`
        if (scheduleContext.project.description) {
          fullContext += `- 설명: ${scheduleContext.project.description}\n`
        }
      }
      if (scheduleContext.attendees && scheduleContext.attendees.length > 0) {
        fullContext += `\n## 참석자 (${scheduleContext.attendees.length}명)\n`
        scheduleContext.attendees.forEach((a: any) => {
          const info = [a.name]
          if (a.position) info.push(a.position)
          if (a.company) info.push(a.company)
          fullContext += `- ${info.join(' / ')}\n`
        })
      }
      if (scheduleContext.departments && scheduleContext.departments.length > 0) {
        fullContext += `\n## 참여 부서\n`
        scheduleContext.departments.forEach((d: any) => {
          fullContext += `- ${d.company ? `${d.company} - ` : ''}${d.name}\n`
        })
      }
      fullContext += `\n`
    }
    
    if (meetingContext && meetingContext !== '검색된 내용 없음') {
      fullContext += `## 검색된 회의 내용\n${meetingContext}\n\n`
    }
    if (taskContext) {
      fullContext += `${taskContext}\n`
    }
    if (documentContext) {
      fullContext += `${documentContext}\n`
    }

    // ========================================
    // Claude Sonnet으로 응답 생성
    // ========================================
    const systemPrompt = buildSystemPrompt({
      hasTask: taskCount > 0,
      hasDoc: docCount > 0,
      hasMeeting: searchResults.length > 0
    })
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}

${fullContext}

## 사용자 질문
${message}

## 응답 형식
답변 후 마지막에 반드시 아래 형식으로 후속 질문 2-3개를 제안하세요:

---SUGGESTIONS---
- 후속 질문 1
- 후속 질문 2
- 후속 질문 3

위 정보를 바탕으로 답변해주세요.`
        }
      ]
    })

    let aiResponse = response.content[0].type === 'text'
      ? response.content[0].text
      : '응답을 생성할 수 없습니다.'

    // 후속 질문 파싱
    let suggestions: string[] = []
    const suggestionsMatch = aiResponse.match(/---SUGGESTIONS---\s*([\s\S]*?)$/i)
    if (suggestionsMatch) {
      suggestions = suggestionsMatch[1]
        .split('\n')
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(line => line.length > 0)
        .slice(0, 3)
      // 응답에서 후속 질문 부분 제거
      aiResponse = aiResponse.replace(/---SUGGESTIONS---[\s\S]*$/i, '').trim()
    }

    // 출처 정보 구성
    const sources = searchResults.slice(0, 3).map((r: any) => ({
      title: r.meetingTitle || r.entityType || '회의',
      content: r.content.slice(0, 150) + '...'
    }))

    // AI 응답 저장
    const aiMsgId = crypto.randomUUID()
    await db.$executeRaw`
      INSERT INTO chat_messages (id, "sessionId", role, content, "createdAt")
      VALUES (${aiMsgId}, ${currentSessionId}, 'assistant', ${aiResponse}, ${new Date()})
    `

    // 세션 제목 업데이트 (첫 메시지인 경우)
    await db.$executeRaw`
      UPDATE chat_sessions 
      SET title = ${message.slice(0, 50)}
      WHERE id = ${currentSessionId} AND title IS NULL
    `

    return NextResponse.json({
      response: aiResponse,
      sources,
      suggestions,
      sessionId: currentSessionId,
      searchInfo: {
        meetingCount: searchResults.length,
        documentCount: docCount,
        taskCount: taskCount
      }
    })

  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

/**
 * 시스템 프롬프트 생성
 */
function buildSystemPrompt(options: { hasTask: boolean, hasDoc: boolean, hasMeeting: boolean }): string {
  let prompt = `당신은 프로젝트 관련 정보를 통합 검색해주는 AI 어시스턴트입니다.

## 규칙
1. 아래 제공된 정보만 사용하세요.
2. 정보에 없는 내용은 절대 지어내지 마세요.
3. 정보를 찾을 수 없으면 "해당 내용을 찾을 수 없습니다"라고 답하세요.
4. 답변은 한국어로 간결하게 작성하세요.
5. 여러 소스(회의록, 태스크, 문서)에서 정보가 있으면 구분해서 답변하세요.`

  if (options.hasTask) {
    prompt += `

## 📋 태스크/액션 아이템 표시 규칙
- ⏳ 진행중 (todo/in_progress)
- ✅ 완료 (done)
- 🔄 Task로 변환됨
- 담당자와 마감일 정보가 있으면 포함하세요.`
  }

  if (options.hasDoc) {
    prompt += `

## 📄 문서 표시 규칙
- 문서 제목과 출처(meeting-mind 또는 schedule-manager)를 명시하세요.
- 관련 내용 요약을 포함하세요.`
  }

  if (options.hasMeeting) {
    prompt += `

## 🎤 회의록 표시 규칙
- 회의명과 날짜를 언급하세요.
- 발언자가 명시된 경우 포함하세요.`
  }

  return prompt
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
