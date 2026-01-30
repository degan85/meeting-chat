require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ DB 연결 성공!\n');

    // 회의 수
    const meetingCount = await client.query('SELECT COUNT(*) FROM meetings');
    console.log('📊 총 회의 수:', meetingCount.rows[0].count);

    // 전사 청크 수
    const chunkCount = await client.query('SELECT COUNT(*) FROM meeting_chunks');
    console.log('📝 전사 청크 수:', chunkCount.rows[0].count);

    // meetings 테이블 컬럼 확인
    const meetingCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'meetings' LIMIT 10
    `);
    console.log('\n📋 meetings 컬럼:', meetingCols.rows.map(r => r.column_name).join(', '));

    // meeting_chunks 테이블 컬럼 확인
    const chunkCols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'meeting_chunks' LIMIT 10
    `);
    console.log('📋 meeting_chunks 컬럼:', chunkCols.rows.map(r => r.column_name).join(', '));

    // 최근 회의 5개
    const recentMeetings = await client.query(`
      SELECT id, title, "createdAt" FROM meetings 
      ORDER BY "createdAt" DESC LIMIT 5
    `);
    console.log('\n🕐 최근 회의:');
    recentMeetings.rows.forEach(m => {
      console.log(`  - [${m.id.slice(0,8)}] ${m.title} (${new Date(m.createdAt).toLocaleDateString('ko-KR')})`);
    });

    // 청크 샘플
    console.log('\n📄 전사 청크 샘플:');
    const chunkSample = await client.query(`
      SELECT content, speaker FROM meeting_chunks 
      ORDER BY "createdAt" DESC LIMIT 3
    `);
    chunkSample.rows.forEach((c, i) => {
      console.log(`\n[${i+1}] ${c.speaker || '화자 없음'}:`);
      console.log(`   "${c.content.slice(0, 150)}..."`);
    });

  } catch (err) {
    console.error('❌ 에러:', err.message);
  } finally {
    await client.end();
  }
}

testConnection();
