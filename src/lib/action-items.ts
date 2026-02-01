import { db } from './db'

export interface ActionItemWithTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigneeName: string | null
  assigneeEmail: string | null
  dueDate: Date | null
  meetingId: string
  meetingTitle: string
  meetingDate: Date
  convertedToType: string | null
  convertedToId: string | null
  // Task 정보 (변환된 경우)
  taskStatus: string | null
  taskDueDate: Date | null
  projectName: string | null
  projectId: string | null
}

/**
 * 액션 아이템 관련 키워드 감지
 */
export function detectActionItemIntent(message: string): boolean {
  const keywords = [
    '액션 아이템', '액션아이템', 'action item', 'actionitem',
    '할 일', '할일', 'todo', '투두',
    '미완료', '완료 안', '안 된', '안된',
    '담당', '배정', '맡은', '할당',
    '진행 상황', '진행상황', '진행률',
    '태스크', 'task'
  ]
  const lowerMessage = message.toLowerCase()
  return keywords.some(k => lowerMessage.includes(k.toLowerCase()))
}

/**
 * 상태 필터 파싱
 */
export function parseStatusFilter(message: string): 'all' | 'todo' | 'done' {
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes('완료') && !lowerMessage.includes('미완료') && !lowerMessage.includes('안')) {
    return 'done'
  }
  if (lowerMessage.includes('미완료') || lowerMessage.includes('안 된') || lowerMessage.includes('안된') || lowerMessage.includes('진행')) {
    return 'todo'
  }
  return 'all'
}

/**
 * 채팅용 액션 아이템 조회
 */
export async function getActionItemsForChat(
  userId: string,
  options: {
    projectId?: string
    meetingId?: string
    status?: 'all' | 'todo' | 'done'
    assigneeOnly?: boolean
  } = {}
): Promise<ActionItemWithTask[]> {
  const { projectId, meetingId, status = 'all', assigneeOnly = false } = options

  try {
    // 기본 쿼리: 사용자가 접근 가능한 회의의 액션 아이템
    let query = `
      SELECT 
        ai.id,
        ai.title,
        ai.description,
        ai.status,
        ai.priority,
        ai."assigneeName",
        ai."assigneeEmail",
        ai."dueDate",
        ai."meetingId",
        ai.converted_to_type as "convertedToType",
        ai.converted_to_id as "convertedToId",
        m.title as "meetingTitle",
        m."createdAt" as "meetingDate",
        t.status as "taskStatus",
        t."dueDate" as "taskDueDate",
        p.name as "projectName",
        p.id as "projectId"
      FROM action_items ai
      JOIN meetings m ON ai."meetingId" = m.id
      LEFT JOIN tasks t ON ai.id = t."actionItemId"
      LEFT JOIN projects p ON t."projectId" = p.id
      LEFT JOIN meeting_projects mp ON m.id = mp."meetingId"
      WHERE m."userId" = $1
    `

    const params: any[] = [userId]
    let paramIndex = 2

    // 프로젝트 필터
    if (projectId) {
      query += ` AND mp."projectId" = $${paramIndex}`
      params.push(projectId)
      paramIndex++
    }

    // 특정 회의 필터
    if (meetingId) {
      query += ` AND ai."meetingId" = $${paramIndex}`
      params.push(meetingId)
      paramIndex++
    }

    // 상태 필터
    if (status === 'todo') {
      query += ` AND ai.status != 'done'`
    } else if (status === 'done') {
      query += ` AND ai.status = 'done'`
    }

    // 담당자 필터 (본인만)
    if (assigneeOnly) {
      query += ` AND ai."assigneeId" = $${paramIndex}`
      params.push(userId)
      paramIndex++
    }

    query += ` ORDER BY m."createdAt" DESC, ai."createdAt" DESC LIMIT 30`

    const items = await db.$queryRawUnsafe<ActionItemWithTask[]>(query, ...params)
    return items
  } catch (error) {
    console.error('Error fetching action items:', error)
    return []
  }
}

/**
 * 액션 아이템을 마크다운 형식으로 포맷
 */
export function formatActionItemsForContext(items: ActionItemWithTask[]): string {
  if (items.length === 0) {
    return '조회된 액션 아이템이 없습니다.'
  }

  // 프로젝트별로 그룹화
  const byProject: Record<string, ActionItemWithTask[]> = {}
  const noProject: ActionItemWithTask[] = []

  items.forEach(item => {
    if (item.projectName) {
      if (!byProject[item.projectName]) {
        byProject[item.projectName] = []
      }
      byProject[item.projectName].push(item)
    } else {
      noProject.push(item)
    }
  })

  let result = `## 액션 아이템 현황 (총 ${items.length}건)\n\n`

  // 프로젝트별 출력
  Object.entries(byProject).forEach(([projectName, projectItems]) => {
    result += `### 📁 ${projectName}\n`
    projectItems.forEach(item => {
      result += formatSingleItem(item)
    })
    result += '\n'
  })

  // 프로젝트 미연결
  if (noProject.length > 0) {
    result += `### 📋 기타\n`
    noProject.forEach(item => {
      result += formatSingleItem(item)
    })
  }

  return result
}

function formatSingleItem(item: ActionItemWithTask): string {
  const statusIcon = getStatusIcon(item.status, item.taskStatus)
  const assignee = item.assigneeName || '미배정'
  const dueDate = item.taskDueDate || item.dueDate
  const dueDateStr = dueDate ? formatDate(dueDate) : '마감일 없음'
  
  let line = `${statusIcon} **${item.title}**\n`
  line += `   - 담당: ${assignee} | 마감: ${dueDateStr}\n`
  line += `   - 회의: ${item.meetingTitle} (${formatDate(item.meetingDate)})\n`
  
  if (item.convertedToType === 'task') {
    line += `   - 🔄 Task로 변환됨 (상태: ${item.taskStatus || 'unknown'})\n`
  } else if (item.convertedToType === 'issue') {
    line += `   - 🐛 Issue로 변환됨\n`
  }
  
  return line + '\n'
}

function getStatusIcon(aiStatus: string, taskStatus: string | null): string {
  // Task 상태가 있으면 우선
  if (taskStatus) {
    switch (taskStatus) {
      case 'DONE': return '✅'
      case 'IN_PROGRESS': return '🔄'
      case 'IN_REVIEW': return '👀'
      case 'BLOCKED': return '🚫'
      default: return '⏳'
    }
  }
  
  // ActionItem 상태
  switch (aiStatus) {
    case 'done': return '✅'
    case 'in_progress': return '🔄'
    default: return '⏳'
  }
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
