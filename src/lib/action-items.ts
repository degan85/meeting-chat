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
  taskStatus: string | null
  taskDueDate: Date | null
  projectName: string | null
  projectId: string | null
}

export interface TaskItem {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigneeName: string | null
  dueDate: Date | null
  completedAt: Date | null
  projectName: string | null
  projectId: string | null
  createdAt: Date
  // ActionItem 연결 여부
  actionItemId: string | null
  meetingTitle: string | null
}

/**
 * 액션 아이템/태스크 관련 키워드 감지
 */
export function detectActionItemIntent(message: string): boolean {
  const keywords = [
    '액션 아이템', '액션아이템', 'action item', 'actionitem',
    '할 일', '할일', 'todo', '투두',
    '미완료', '완료 안', '안 된', '안된',
    '완료된', '완료한',
    '담당', '배정', '맡은', '할당',
    '진행 상황', '진행상황', '진행률',
    '태스크', '테스크', 'task', 'tasks'
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
 * Task 테이블 직접 조회 (schedule-manager 태스크)
 */
export async function getTasksForChat(
  userId: string,
  options: {
    projectId?: string
    status?: 'all' | 'todo' | 'done'
    assigneeOnly?: boolean
  } = {}
): Promise<TaskItem[]> {
  const { projectId, status = 'all', assigneeOnly = false } = options

  try {
    let query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t."assigneeName",
        t."dueDate",
        t."completedAt",
        t."createdAt",
        t."actionItemId",
        p.name as "projectName",
        p.id as "projectId",
        m.title as "meetingTitle"
      FROM tasks t
      LEFT JOIN projects p ON t."projectId" = p.id
      LEFT JOIN project_members pm ON p.id = pm."projectId"
      LEFT JOIN action_items ai ON t."actionItemId" = ai.id
      LEFT JOIN meetings m ON ai."meetingId" = m.id
      WHERE (
        t."userId" = $1 
        OR t."assigneeId" = $1
        OR p."ownerId" = $1
        OR pm."userId" = $1
      )
    `

    const params: any[] = [userId]
    let paramIndex = 2

    // 프로젝트 필터
    if (projectId) {
      query += ` AND t."projectId" = $${paramIndex}`
      params.push(projectId)
      paramIndex++
    }

    // 상태 필터
    if (status === 'todo') {
      query += ` AND t.status NOT IN ('DONE', 'CANCELLED')`
    } else if (status === 'done') {
      query += ` AND t.status = 'DONE'`
    }

    // 담당자 필터 (본인만)
    if (assigneeOnly) {
      query += ` AND t."assigneeId" = $${paramIndex}`
      params.push(userId)
      paramIndex++
    }

    query += ` ORDER BY t."createdAt" DESC LIMIT 30`

    const items = await db.$queryRawUnsafe<TaskItem[]>(query, ...params)
    return items
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return []
  }
}

/**
 * 채팅용 액션 아이템 조회 (ActionItem 테이블)
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

    if (projectId) {
      query += ` AND mp."projectId" = $${paramIndex}`
      params.push(projectId)
      paramIndex++
    }

    if (meetingId) {
      query += ` AND ai."meetingId" = $${paramIndex}`
      params.push(meetingId)
      paramIndex++
    }

    if (status === 'todo') {
      query += ` AND ai.status != 'done'`
    } else if (status === 'done') {
      query += ` AND ai.status = 'done'`
    }

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
 * 통합 조회: Task + ActionItem 모두
 */
export async function getAllTasksAndActionItems(
  userId: string,
  options: {
    projectId?: string
    meetingId?: string
    status?: 'all' | 'todo' | 'done'
    assigneeOnly?: boolean
  } = {}
): Promise<{ tasks: TaskItem[], actionItems: ActionItemWithTask[] }> {
  const [tasks, actionItems] = await Promise.all([
    getTasksForChat(userId, options),
    getActionItemsForChat(userId, options)
  ])
  
  return { tasks, actionItems }
}

/**
 * Task 목록을 마크다운 형식으로 포맷
 */
export function formatTasksForContext(tasks: TaskItem[]): string {
  if (tasks.length === 0) {
    return ''
  }

  // 프로젝트별로 그룹화
  const byProject: Record<string, TaskItem[]> = {}
  const noProject: TaskItem[] = []

  tasks.forEach(task => {
    if (task.projectName) {
      if (!byProject[task.projectName]) {
        byProject[task.projectName] = []
      }
      byProject[task.projectName].push(task)
    } else {
      noProject.push(task)
    }
  })

  let result = `## 태스크 현황 (총 ${tasks.length}건)\n\n`

  // 프로젝트별 출력
  Object.entries(byProject).forEach(([projectName, projectTasks]) => {
    result += `### 📁 ${projectName}\n`
    projectTasks.forEach(task => {
      result += formatSingleTask(task)
    })
    result += '\n'
  })

  // 프로젝트 미연결
  if (noProject.length > 0) {
    result += `### 📋 기타\n`
    noProject.forEach(task => {
      result += formatSingleTask(task)
    })
  }

  return result
}

function formatSingleTask(task: TaskItem): string {
  const statusIcon = getTaskStatusIcon(task.status)
  const assignee = task.assigneeName || '미배정'
  const dueDateStr = task.dueDate ? formatDate(task.dueDate) : '마감일 없음'
  
  let line = `${statusIcon} **${task.title}**\n`
  line += `   - 담당: ${assignee} | 마감: ${dueDateStr} | 상태: ${task.status}\n`
  
  if (task.meetingTitle) {
    line += `   - 🔗 회의에서 생성: ${task.meetingTitle}\n`
  }
  
  return line + '\n'
}

/**
 * 액션 아이템을 마크다운 형식으로 포맷
 */
export function formatActionItemsForContext(items: ActionItemWithTask[]): string {
  if (items.length === 0) {
    return ''
  }

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

  Object.entries(byProject).forEach(([projectName, projectItems]) => {
    result += `### 📁 ${projectName}\n`
    projectItems.forEach(item => {
      result += formatSingleActionItem(item)
    })
    result += '\n'
  })

  if (noProject.length > 0) {
    result += `### 📋 기타\n`
    noProject.forEach(item => {
      result += formatSingleActionItem(item)
    })
  }

  return result
}

function formatSingleActionItem(item: ActionItemWithTask): string {
  const statusIcon = getActionItemStatusIcon(item.status, item.taskStatus)
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

/**
 * 통합 포맷: Task + ActionItem
 */
export function formatAllForContext(
  tasks: TaskItem[], 
  actionItems: ActionItemWithTask[]
): string {
  let result = ''
  
  if (tasks.length > 0) {
    result += formatTasksForContext(tasks)
    result += '\n'
  }
  
  if (actionItems.length > 0) {
    result += formatActionItemsForContext(actionItems)
  }
  
  if (result === '') {
    return '조회된 태스크/액션 아이템이 없습니다.'
  }
  
  return result
}

function getTaskStatusIcon(status: string): string {
  switch (status) {
    case 'DONE': return '✅'
    case 'IN_PROGRESS': return '🔄'
    case 'IN_REVIEW': return '👀'
    case 'BLOCKED': return '🚫'
    case 'CANCELLED': return '❌'
    case 'TODO':
    default: return '⏳'
  }
}

function getActionItemStatusIcon(aiStatus: string, taskStatus: string | null): string {
  if (taskStatus) {
    return getTaskStatusIcon(taskStatus)
  }
  
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
