import { prisma } from './db'

// 문서 검색 관련 키워드
const DOCUMENT_KEYWORDS = [
  '문서', '파일', '자료', '첨부', '업로드',
  '요구사항', '명세서', '기능정의', '설계', '기획',
  'PDF', 'PPT', '엑셀', '한글', '워드',
  '보고서', '회의록', '발표자료', '제안서',
  'document', 'file', 'upload', 'attachment'
]

/**
 * 문서 검색 의도 감지
 */
export function detectDocumentIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase()
  
  // 문서 관련 키워드 포함 여부
  const hasDocumentKeyword = DOCUMENT_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  )
  
  // 특정 패턴 감지
  const patterns = [
    /어떤.*문서/i,
    /문서.*있/i,
    /파일.*찾/i,
    /자료.*검색/i,
    /업로드.*된/i,
    /첨부.*파일/i,
    /관련.*자료/i,
    /정의서/i,
    /명세서/i,
  ]
  
  const hasPattern = patterns.some(pattern => pattern.test(message))
  
  return hasDocumentKeyword || hasPattern
}

/**
 * 임베딩 생성
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // 런타임에만 OpenAI 클라이언트 생성
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('Embedding generation failed:', error)
    return new Array(1536).fill(0)
  }
}

/**
 * 문서 검색 (meeting-mind + schedule-manager)
 */
export async function searchDocuments(query: string, limit = 10): Promise<any[]> {
  const results: any[] = []
  
  try {
    // 1. meeting-mind 문서 벡터 검색
    const queryEmbedding = await generateEmbedding(query)
    const isDummy = queryEmbedding.every(v => v === 0)
    
    if (!isDummy) {
      try {
        const vectorResults = await prisma.$queryRaw`
          SELECT 
            d.id,
            d.title,
            d."fileName",
            d."fileType",
            d."extractedText",
            d.summary,
            d."createdAt",
            'meeting-mind' as source,
            dc.content as matched_content,
            (1 - (dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector)) as similarity
          FROM documents d
          JOIN document_chunks dc ON d.id = dc."documentId"
          WHERE d.status = 'completed'
            AND dc.embedding IS NOT NULL
          ORDER BY dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
          LIMIT ${limit}
        ` as any[]
        
        results.push(...vectorResults.filter((r: any) => r.similarity > 0.35))
      } catch (e) {
        console.error('Vector search failed:', e)
      }
    }
    
    // 2. meeting-mind 문서 키워드 검색
    const keywordDocs = await prisma.document.findMany({
      where: {
        status: 'completed',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { fileName: { contains: query, mode: 'insensitive' } },
          { extractedText: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
        extractedText: true,
        summary: true,
        createdAt: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })
    
    keywordDocs.forEach((doc: any) => {
      if (!results.find(r => r.id === doc.id)) {
        results.push({
          ...doc,
          source: 'meeting-mind',
          similarity: 0.6,
          matched_content: doc.summary || doc.extractedText?.substring(0, 300),
        })
      }
    })
    
    // 3. schedule-manager 문서 검색
    const projectDocs = await prisma.projectDocument.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { originalName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        originalName: true,
        fileType: true,
        category: true,
        createdAt: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })
    
    projectDocs.forEach((doc: any) => {
      results.push({
        id: doc.id,
        title: doc.title,
        fileName: doc.originalName,
        fileType: doc.fileType,
        extractedText: doc.description,
        summary: null,
        createdAt: doc.createdAt,
        source: 'schedule-manager',
        category: doc.category,
        similarity: 0.6,
        matched_content: doc.description || doc.title,
      })
    })
    
  } catch (error) {
    console.error('Document search error:', error)
  }
  
  // 정렬 및 중복 제거
  return results
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .filter((item, index, self) => 
      index === self.findIndex(t => t.id === item.id)
    )
    .slice(0, limit)
}

/**
 * 문서 검색 결과를 컨텍스트 문자열로 변환
 */
export function formatDocumentsForContext(documents: any[]): string {
  if (!documents || documents.length === 0) {
    return ''
  }
  
  let context = '## 📄 검색된 문서\n\n'
  
  documents.forEach((doc, index) => {
    const date = doc.createdAt 
      ? new Date(doc.createdAt).toLocaleDateString('ko-KR')
      : ''
    
    const sourceLabel = doc.source === 'meeting-mind' ? '회의록 문서' : '프로젝트 문서'
    const categoryLabel = doc.category ? ` [${doc.category}]` : ''
    
    context += `### ${index + 1}. ${doc.title}\n`
    context += `- 📁 파일: ${doc.fileName}\n`
    context += `- 📅 날짜: ${date}\n`
    context += `- 🏷️ 출처: ${sourceLabel}${categoryLabel}\n`
    
    if (doc.summary) {
      context += `- 📝 요약: ${doc.summary.substring(0, 200)}...\n`
    }
    
    if (doc.matched_content) {
      context += `- 🔍 관련 내용: ${doc.matched_content.substring(0, 300)}...\n`
    }
    
    context += '\n'
  })
  
  return context
}
