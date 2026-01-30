import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

declare global {
  var __db: PrismaClient | undefined
}

let db: PrismaClient

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.STORAGE_DATABASE_URL || process.env.DATABASE_URL

  // Neon adapter 사용 (serverless 환경)
  if (connectionString?.includes('neon.tech')) {
    const adapter = new PrismaNeon({ connectionString })
    return new PrismaClient({ adapter })
  }

  return new PrismaClient()
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

// 벡터 검색
export async function searchByVector(embedding: number[], meetingId?: string, limit = 15) {
  const embeddingStr = `[${embedding.join(',')}]`
  
  try {
    let results: any[]
    
    if (meetingId) {
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
    } else {
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
        ORDER BY si.embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `
    }
    
    return results
  } catch (error) {
    console.error('Vector search error:', error)
    throw error
  }
}

// 키워드 검색
export async function searchByKeyword(keywords: string[], meetingId?: string, limit = 10) {
  try {
    const pattern = keywords.map(k => `%${k}%`)
    
    if (meetingId) {
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
    }
    
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
        AND si.content ILIKE ANY(${pattern})
      ORDER BY m."createdAt" DESC NULLS LAST
      LIMIT ${limit}
    `
  } catch (error) {
    console.error('Keyword search error:', error)
    throw error
  }
}

// 회의 목록
export async function getMeetings() {
  try {
    return await db.$queryRaw`
      SELECT id, title, "createdAt"
      FROM meetings
      ORDER BY "createdAt" DESC
      LIMIT 50
    `
  } catch (error) {
    console.error('Get meetings error:', error)
    throw error
  }
}
