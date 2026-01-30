import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

declare global {
  var __db: PrismaClient | undefined
}

// Prevent multiple Prisma clients in development
let db: PrismaClient

// Neon Serverless adapter를 사용한 Prisma 클라이언트 설정
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.STORAGE_DATABASE_URL || process.env.DATABASE_URL

  // Neon adapter 사용 (serverless 환경에서 안정적인 연결 유지)
  if (connectionString?.includes('neon.tech')) {
    const adapter = new PrismaNeon({ connectionString })

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
      errorFormat: 'pretty',
    })
  }

  // 일반 PostgreSQL (로컬 개발 등)
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    errorFormat: 'pretty',
  })
}

if (process.env.NODE_ENV === 'production') {
  db = createPrismaClient()
} else {
  if (!global.__db) {
    global.__db = createPrismaClient()
  }
  db = global.__db
}

export { db as prisma }
export { db }

// 벡터 검색 (접근 가능한 회의 ID 필터 추가)
export async function searchByVector(
  embedding: number[],
  accessibleMeetingIds?: string[],
  meetingId?: string,
  limit = 15
) {
  const embeddingStr = `[${embedding.join(',')}]`

  try {
    let results: any[]

    if (meetingId) {
      // 특정 회의에서 검색
      results = await db.$queryRaw`
        SELECT
          si.content,
          si."entityId",
          si."entityType",
          m.title as "meetingTitle",
          m."createdAt" as "meetingDate",
          1 - (si.embedding <=> ${embeddingStr}::vector) as similarity
        FROM search_index si
        LEFT JOIN meetings m ON si."entityId" = m.id
        WHERE si.embedding IS NOT NULL
          AND si."entityType" IN ('meeting', 'transcript')
          AND si."entityId" = ${meetingId}
        ORDER BY si.embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `
    } else if (accessibleMeetingIds && accessibleMeetingIds.length > 0) {
      // 접근 가능한 회의들에서만 검색
      results = await db.$queryRaw`
        SELECT
          si.content,
          si."entityId",
          si."entityType",
          m.title as "meetingTitle",
          m."createdAt" as "meetingDate",
          1 - (si.embedding <=> ${embeddingStr}::vector) as similarity
        FROM search_index si
        LEFT JOIN meetings m ON si."entityId" = m.id
        WHERE si.embedding IS NOT NULL
          AND si."entityType" IN ('meeting', 'transcript')
          AND si."entityId" = ANY(${accessibleMeetingIds})
        ORDER BY si.embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `
    } else {
      // 접근 가능한 회의가 없으면 빈 결과 반환
      return []
    }

    return results
  } catch (error) {
    console.error('Vector search error:', error)
    throw error
  }
}

// 키워드 검색 (접근 가능한 회의 ID 필터 추가)
export async function searchByKeyword(
  keywords: string[],
  accessibleMeetingIds?: string[],
  meetingId?: string,
  limit = 10
) {
  try {
    const pattern = keywords.map(k => `%${k}%`)

    if (meetingId) {
      // 특정 회의에서 검색
      return await db.$queryRaw`
        SELECT
          si.content,
          si."entityId",
          si."entityType",
          m.title as "meetingTitle",
          m."createdAt" as "meetingDate"
        FROM search_index si
        LEFT JOIN meetings m ON si."entityId" = m.id
        WHERE si."entityType" IN ('meeting', 'transcript')
          AND si."entityId" = ${meetingId}
          AND si.content ILIKE ANY(${pattern})
        ORDER BY m."createdAt" DESC NULLS LAST
        LIMIT ${limit}
      `
    } else if (accessibleMeetingIds && accessibleMeetingIds.length > 0) {
      // 접근 가능한 회의들에서만 검색
      return await db.$queryRaw`
        SELECT
          si.content,
          si."entityId",
          si."entityType",
          m.title as "meetingTitle",
          m."createdAt" as "meetingDate"
        FROM search_index si
        LEFT JOIN meetings m ON si."entityId" = m.id
        WHERE si."entityType" IN ('meeting', 'transcript')
          AND si."entityId" = ANY(${accessibleMeetingIds})
          AND si.content ILIKE ANY(${pattern})
        ORDER BY m."createdAt" DESC NULLS LAST
        LIMIT ${limit}
      `
    }

    // 접근 가능한 회의가 없으면 빈 결과 반환
    return []
  } catch (error) {
    console.error('Keyword search error:', error)
    throw error
  }
}

// 회의 목록 (접근 가능한 회의 ID 필터 추가)
export async function getMeetings(accessibleMeetingIds?: string[]) {
  try {
    if (!accessibleMeetingIds || accessibleMeetingIds.length === 0) {
      return []
    }

    return await db.$queryRaw`
      SELECT id, title, "createdAt"
      FROM meetings
      WHERE id = ANY(${accessibleMeetingIds})
      ORDER BY "createdAt" DESC
      LIMIT 50
    `
  } catch (error) {
    console.error('Get meetings error:', error)
    throw error
  }
}

// 프로젝트에 속한 회의 ID 목록
export async function getProjectMeetingIds(projectId: string): Promise<string[]> {
  try {
    const results: any[] = await db.$queryRaw`
      SELECT "meetingId"
      FROM meeting_projects
      WHERE "projectId" = ${projectId}
    `
    return results.map(r => r.meetingId)
  } catch (error) {
    console.error('Get project meeting IDs error:', error)
    return []
  }
}
