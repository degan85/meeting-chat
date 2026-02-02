import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 검색 쿼리용 임베딩 생성
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // 런타임에만 OpenAI 클라이언트 생성
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    // 실패 시 더미 임베딩 반환
    return new Array(1536).fill(0);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');
    const source = searchParams.get('source'); // 'meeting-mind', 'schedule-manager', 'all'

    if (!query) {
      return NextResponse.json(
        { success: false, error: '검색어가 필요합니다' },
        { status: 400 }
      );
    }

    console.log(`[Document Search] Query: "${query}", Source: ${source || 'all'}`);

    const results: any[] = [];

    // 1. meeting-mind 문서 검색 (documents 테이블)
    if (!source || source === 'all' || source === 'meeting-mind') {
      try {
        // 벡터 검색 시도
        const queryEmbedding = await generateEmbedding(query);
        const isDummyEmbedding = queryEmbedding.every(val => val === 0);

        if (!isDummyEmbedding) {
          // 벡터 유사도 검색
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
            LIMIT ${Math.min(limit, 20)}
          ` as any[];

          results.push(...vectorResults.filter((r: any) => r.similarity > 0.3));
          console.log(`[Vector Search] Found ${vectorResults.length} results`);
        }

        // 키워드 검색 (폴백 또는 추가)
        const keywordResults = await prisma.document.findMany({
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
        });

        keywordResults.forEach((doc: any) => {
          if (!results.find(r => r.id === doc.id)) {
            results.push({
              ...doc,
              source: 'meeting-mind',
              similarity: 0.7,
              matched_content: extractHighlight(doc.extractedText || doc.summary || '', query),
            });
          }
        });

        console.log(`[Keyword Search - meeting-mind] Found ${keywordResults.length} results`);
      } catch (error) {
        console.error('[meeting-mind search error]:', error);
      }
    }

    // 2. schedule-manager 문서 검색 (project_documents 테이블)
    if (!source || source === 'all' || source === 'schedule-manager') {
      try {
        const projectDocResults = await prisma.projectDocument.findMany({
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
        });

        projectDocResults.forEach((doc: any) => {
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
            similarity: 0.7,
            matched_content: extractHighlight(doc.description || doc.title, query),
          });
        });

        // 키워드 테이블에서도 검색
        const keywordMatches = await prisma.documentKeyword.findMany({
          where: {
            keyword: { contains: query, mode: 'insensitive' },
          },
          select: {
            keyword: true,
            frequency: true,
            importance: true,
            context: true,
            analysisId: true,
          },
          take: limit,
        });

        console.log(`[Keyword Search - schedule-manager] Found ${projectDocResults.length} docs, ${keywordMatches.length} keywords`);
      } catch (error) {
        console.error('[schedule-manager search error]:', error);
      }
    }

    // 결과 정렬 (유사도 순)
    const sortedResults = results
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);

    // 중복 제거
    const uniqueResults = sortedResults.filter((item, index, self) =>
      index === self.findIndex(t => t.id === item.id)
    );

    return NextResponse.json({
      success: true,
      query,
      total: uniqueResults.length,
      results: uniqueResults.map(formatResult),
    });

  } catch (error) {
    console.error('[Document search error]:', error);
    return NextResponse.json(
      { success: false, error: '검색 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 하이라이트 텍스트 추출
function extractHighlight(text: string, query: string, contextLength = 150): string {
  if (!text || !query) return '';
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) return text.substring(0, contextLength) + '...';
  
  const start = Math.max(0, index - contextLength / 2);
  const end = Math.min(text.length, index + query.length + contextLength / 2);
  
  let result = text.substring(start, end);
  if (start > 0) result = '...' + result;
  if (end < text.length) result = result + '...';
  
  return result;
}

// 결과 포맷팅
function formatResult(result: any) {
  return {
    id: result.id,
    title: result.title,
    fileName: result.fileName,
    fileType: result.fileType,
    summary: result.summary ? result.summary.substring(0, 300) : null,
    source: result.source,
    category: result.category,
    similarity: result.similarity,
    highlight: result.matched_content,
    createdAt: result.createdAt,
  };
}
