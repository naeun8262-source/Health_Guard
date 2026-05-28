import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// 환경변수 로드
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!.replace(/\/rest\/v1\/?$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY!; // Service Role Key 권장
const LAW_API_KEY = process.env.LAW_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !LAW_API_KEY || !OPENAI_API_KEY) {
  console.error('환경 변수가 제대로 설정되지 않았습니다.');
  process.exit(1);
}

// 클라이언트 초기화
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * 텍스트를 OpenAI 임베딩으로 변환 (text-embedding-3-small)
 */
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('임베딩 생성 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 1. 법령 본문 수집 (예: 중대재해처벌법, 산업안전보건법)
 */
async function fetchLawArticles(lawName: string) {
  console.log(`\n⏳ [${lawName}] 본문 수집 시작...`);
  try {
    // 검색 API로 법령일련번호(MST) 조회
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(lawName)}`;
    const searchRes = await axios.get(searchUrl);
    const searchXml = await parseStringPromise(searchRes.data);
    
    console.log("DEBUG searchXml:", JSON.stringify(searchXml, null, 2));

    if (!searchXml.LawSearch || !searchXml.LawSearch.law || searchXml.LawSearch.law.length === 0) {
      console.log(`❌ [${lawName}] 검색 결과가 없습니다.`);
      return;
    }
    
    const mst = searchXml.LawSearch.law[0].법령일련번호[0];

    // 상세조회 API 호출
    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&MST=${mst}`;
    const detailRes = await axios.get(detailUrl);
    const detailXml = await parseStringPromise(detailRes.data);

    // DEBUG 추가
    if (!detailXml.법령) {
      console.log(`❌ [${lawName}] 상세조회 API 오류 응답:`, JSON.stringify(detailXml, null, 2));
      return;
    }
    if (!detailXml.법령.조문 || detailXml.법령.조문.length === 0) {
      console.log(`❌ [${lawName}] 조문 데이터가 없습니다:`, JSON.stringify(detailXml.법령, null, 2));
      return;
    }

    const articles = detailXml.법령.조문[0].조문단위;
    if (!articles) return;

    for (const article of articles) {
      const articleNum = article.조문번호 ? article.조문번호[0] : '미상';
      const articleTitle = article.조문제목 ? article.조문제목[0] : '';
      let articleContent = article.조문내용 ? article.조문내용[0] : '';
      
      // 하위 항, 호 내용 추출
      if (article.항) {
        article.항.forEach((hang: any) => {
          if (hang.항내용) articleContent += '\n' + hang.항내용[0];
          if (hang.호) {
            hang.호.forEach((ho: any) => {
              if (ho.호내용) articleContent += '\n  ' + ho.호내용[0];
            });
          }
        });
      }
      
      // 조문 내용 청킹 (텍스트 구성)
      const fullText = `[${lawName}] 제${articleNum}조(${articleTitle})\n${articleContent}`;
      
      // 임베딩 생성 (비용을 위해 예제로 앞부분 10개만 진행하는 등 조절 가능)
      const embedding = await getEmbedding(fullText);
      
      // DB 저장 (Upsert 또는 Insert)
      const { error } = await supabase.from('safety_laws').insert({
        law_name: lawName,
        article_number: `제${articleNum}조`,
        content: fullText,
        embedding: embedding,
        metadata: { type: 'article', title: articleTitle }
      });

      if (error) {
        console.error(`❌ [${lawName} 제${articleNum}조] 저장 실패:`, error.message);
      } else {
        console.log(`✅ [${lawName} 제${articleNum}조] 적재 완료`);
      }
    }
  } catch (error) {
    console.error(`❌ [${lawName}] 수집 중 오류:`, error);
  }
}

/**
 * 2. 별표 파싱 (산업안전보건법 시행령 별표 35 과태료 부과기준)
 * Cheerio를 사용하여 HTML 테이블을 Markdown으로 가공
 */
async function fetchPenaltyAnnex() {
  const lawName = '산업안전보건법 시행령';
  console.log(`\n⏳ [${lawName} 별표] 과태료 부과기준 수집 시작...`);
  
  try {
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(lawName)}`;
    const searchRes = await axios.get(searchUrl);
    const searchXml = await parseStringPromise(searchRes.data);
    const mst = searchXml.LawSearch.law[0].법령일련번호[0];

    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&MST=${mst}`;
    const detailRes = await axios.get(detailUrl);
    const detailXml = await parseStringPromise(detailRes.data);

    if (!detailXml.법령) {
      console.log(`❌ [${lawName} 별표] 상세조회 API 오류 응답:`, JSON.stringify(detailXml, null, 2));
      return;
    }
    if (!detailXml.법령.별표 || detailXml.법령.별표.length === 0) {
      console.log(`❌ [${lawName} 별표] 별표 데이터가 없습니다:`, JSON.stringify(detailXml.법령, null, 2));
      return;
    }

    // 별표 찾기
    const annexes = detailXml.법령.별표[0].별표단위;
    if (!annexes) return;
    
    // 별표 35: 과태료의 부과기준
    const targetAnnex = annexes.find((a: any) => 
      a.별표제목 && a.별표제목[0].includes('과태료의 부과기준')
    );

    if (!targetAnnex) {
      console.log('과태료 별표를 찾을 수 없습니다.');
      return;
    }
    
    const annexTitle = targetAnnex.별표제목[0];
    const annexContent = targetAnnex.별표내용 ? targetAnnex.별표내용[0] : '';
    
    if (!annexContent) return;

    // cheerio로 HTML 테이블 파싱
    const $ = cheerio.load(annexContent);
    
    let markdown = `### ${annexTitle}\n\n`;
    markdown += `| 위반행위 | 1차 과태료 | 2차 과태료 | 3차 과태료 |\n`;
    markdown += `| --- | --- | --- | --- |\n`;

    // <tr> 태그 순회하며 텍스트 추출 (실제 법제처 HTML 구조에 따라 로직 수정 필요할 수 있음)
    $('table tr').each((i, el) => {
      const tds = $(el).find('td');
      
      // 위반행위와 차수별 금액이 있는 행(4칸 이상)
      if (tds.length >= 4) {
        // 테이블 병합(rowspan 등) 처리 방어를 위해 간단한 텍스트 추출
        const violation = $(tds[0]).text().trim().replace(/\s+/g, ' ');
        const first = $(tds[1]).text().trim().replace(/\s+/g, ' ');
        const second = $(tds[2]).text().trim().replace(/\s+/g, ' ');
        const third = $(tds[3]).text().trim().replace(/\s+/g, ' ');
        
        // 빈 줄이 아니면 Markdown 표에 추가
        if (violation.length > 1) {
           markdown += `| ${violation} | ${first} | ${second} | ${third} |\n`;
        }
      }
    });

    console.log(`\n생성된 과태료 Markdown (미리보기):\n${markdown.substring(0, 300)}...\n`);

    // 임베딩 생성 (크기가 너무 크면 여러 청크로 나누어야 하지만, 예제이므로 하나로 생성)
    const embedding = await getEmbedding(markdown);
    
    // DB 저장
    const { error } = await supabase.from('safety_laws').insert({
      law_name: lawName,
      article_number: annexTitle, // 예: [별표 35] 과태료의 부과기준
      content: markdown,
      embedding: embedding,
      metadata: { type: 'penalty_annex' }
    });

    if (error) {
      console.error(`❌ 별표 적재 실패:`, error.message);
    } else {
      console.log(`✅ [${lawName} ${annexTitle}] 적재 완료`);
    }

  } catch (error) {
    console.error('❌ 별표 수집 중 오류:', error);
  }
}

async function main() {
  try {
    console.log('🚀 국가법령 API 연동 및 데이터 적재(Phase 2) 스크립트 실행 시작...');
    
    // 1. 산업안전보건법 및 중대재해처벌법 본문 파싱 및 적재
    await fetchLawArticles('산업안전보건법');
    await fetchLawArticles('산업안전보건법 시행령');
    await fetchLawArticles('산업안전보건법 시행규칙');
    await fetchLawArticles('산업안전보건기준에 관한 규칙');
    await fetchLawArticles('중대재해 처벌 등에 관한 법률');
    
    // 2. 산업안전보건법 시행령 [별표 35] 과태료 기준 파싱 및 적재
    await fetchPenaltyAnnex();
    
    console.log('\n※ 실제 실행을 원하시면 위의 주석을 해제하고 실행해주세요.');
    console.log('✅ 스크립트 실행이 완료되었습니다.');
  } catch (error) {
    console.error('❌ 메인 루프 에러 발생:', error);
  }
}

main();
