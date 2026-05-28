import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// .env 로드 (루트 또는 web 폴더)
dotenv.config({ path: path.resolve(process.cwd(), 'web', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // 폴백

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '') || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
  console.error("Missing environment variables. Make sure SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY are set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// 고품질 법령 데이터 하드코딩
const safetyLawsData = [
  {
    law_name: '산업안전보건법',
    article_number: '제38조',
    content: '[산업안전보건법 제38조(안전조치)]\n사업주는 다음 각 호의 어느 하나에 해당하는 위험으로 인한 산업재해를 예방하기 위하여 필요한 조치를 하여야 한다.\n1. 기계ㆍ기구, 그 밖의 설비에 의한 위험\n2. 폭발성, 발화성 및 인화성 물질 등에 의한 위험\n3. 전기, 열, 그 밖의 에너지에 의한 위험',
    metadata: { type: 'article', title: '안전조치' }
  },
  {
    law_name: '산업안전보건기준에 관한 규칙',
    article_number: '제42조',
    content: '[산업안전보건기준에 관한 규칙 제42조(추락의 방지)]\n사업주는 근로자가 추락하거나 넘어질 위험이 있는 장소(작업발판의 끝, 개구부 등을 말한다)에서 작업할 때에 추락방호망을 치거나 안전대를 착용하도록 하는 등 추락 방지를 위한 조치를 하여야 한다.',
    metadata: { type: 'article', title: '추락의 방지' }
  },
  {
    law_name: '산업안전보건기준에 관한 규칙',
    article_number: '제618조',
    content: '[산업안전보건기준에 관한 규칙 제618조(밀폐공간 보건작업 프로그램 수립·시행 등)]\n사업주는 밀폐공간에서 근로자에게 작업을 하도록 하는 경우 송기마스크 또는 공기호흡기를 지급하여 착용하도록 하고, 환기를 실시해야 하며, 감시인을 배치하여야 한다.',
    metadata: { type: 'article', title: '밀폐공간 환기 및 보호구' }
  },
  {
    law_name: '산업안전보건기준에 관한 규칙',
    article_number: '제171조',
    content: '[산업안전보건기준에 관한 규칙 제171조(전도 등의 방지)]\n사업주는 차량계 하역운반기계등을 사용하는 작업을 할 때에 그 기계가 넘어지거나 굴러떨어짐으로써 근로자에게 위험을 미칠 우려가 있는 경우에는 유도자(신호수)를 배치하여야 한다.',
    metadata: { type: 'article', title: '중장비 신호수 배치' }
  },
  {
    law_name: '중대재해 처벌 등에 관한 법률',
    article_number: '제4조',
    content: '[중대재해처벌법 제4조(사업주와 경영책임자등의 안전 및 보건 확보의무)]\n사업주 또는 경영책임자등은 실질적으로 지배ㆍ운영ㆍ관리하는 사업 또는 사업장에서 종사자의 안전ㆍ보건상 유해 또는 위험을 방지하기 위하여 다음 각 호의 조치를 하여야 한다.\n1. 재해예방에 필요한 인력 및 예산 등 안전보건관리체계의 구축 및 그 이행에 관한 조치',
    metadata: { type: 'article', title: '경영책임자의 안전보건 확보의무' }
  },
  {
    law_name: '중대재해 처벌 등에 관한 법률',
    article_number: '제6조',
    content: '[중대재해처벌법 제6조(중대산업재해 사업주와 경영책임자등의 처벌)]\n제4조의 의무를 위반하여 사망자가 1명 이상 발생한 중대산업재해에 이르게 한 사업주 또는 경영책임자등은 1년 이상의 징역 또는 10억원 이하의 벌금에 처한다.',
    metadata: { type: 'article', title: '중대산업재해 처벌기준' }
  },
  {
    law_name: '산업안전보건법',
    article_number: '제167조',
    content: '[산업안전보건법 제167조(벌칙)]\n제38조제1항, 제39조제1항 또는 제63조를 위반하여 근로자를 사망에 이르게 한 자는 7년 이하의 징역 또는 1억원 이하의 벌금에 처한다.',
    metadata: { type: 'penalty', title: '사망 사고 벌칙' }
  },
  {
    law_name: '산업안전보건법 시행령',
    article_number: '[별표 35]',
    content: '### [별표 35] 과태료의 부과기준 (추락 및 안전보호구 관련)\n| 위반행위 | 1차 과태료 | 2차 과태료 | 3차 과태료 |\n| --- | --- | --- | --- |\n| 사업주가 근로자에게 안전모, 안전화, 안전대 등 보호구를 지급하지 않은 경우 | 50만원 | 100만원 | 300만원 |\n| 근로자가 지급된 보호구를 착용하지 않은 경우 | 5만원 | 10만원 | 15만원 |',
    metadata: { type: 'penalty_annex', title: '보호구 과태료' }
  },
  {
    law_name: '산업안전보건법 시행령',
    article_number: '[별표 35]',
    content: '### [별표 35] 과태료의 부과기준 (밀폐공간 관련)\n| 위반행위 | 1차 과태료 | 2차 과태료 | 3차 과태료 |\n| --- | --- | --- | --- |\n| 밀폐공간 작업 시 환기장치 가동 및 송기마스크 지급 등 안전보건조치를 이행하지 않은 경우 | 500만원 | 1000만원 | 1500만원 |',
    metadata: { type: 'penalty_annex', title: '밀폐공간 과태료' }
  },
  {
    law_name: '산업안전보건법 시행령',
    article_number: '[별표 35]',
    content: '### [별표 35] 과태료의 부과기준 (중장비 작업 관련)\n| 위반행위 | 1차 과태료 | 2차 과태료 | 3차 과태료 |\n| --- | --- | --- | --- |\n| 차량계 하역운반기계(굴착기, 지게차 등) 작업 중 유도자(신호수)를 배치하지 않아 근로자를 위험에 처하게 한 경우 | 300만원 | 600만원 | 1000만원 |',
    metadata: { type: 'penalty_annex', title: '중장비 신호수 과태료' }
  },
  {
    law_name: '산업안전보건법',
    article_number: '제53조',
    content: '[산업안전보건법 제53조(고용노동부장관의 시정명령 및 작업중지명령)]\n고용노동부장관은 산업재해가 발생할 급박한 위험이 있을 때 또는 사업주가 안전조치 및 보건조치 의무를 이행하지 아니하여 근로자에게 현저한 위험이 초래될 우려가 있다고 판단될 때에는 해당 작업의 전부 또는 일부의 중지를 명할 수 있다.',
    metadata: { type: 'article', title: '작업중지명령' }
  }
];

async function seed() {
  console.log("🚀 Starting database seeding process...");

  try {
    // 1. 기존 데이터 삭제
    console.log("🧹 Clearing existing data in 'safety_laws' table...");
    const { error: deleteError } = await supabase
      .from('safety_laws')
      .delete()
      .neq('id', 0); // 모든 로우 삭제

    if (deleteError) {
      console.error("❌ Failed to delete existing data:", deleteError);
      return;
    }
    console.log("✅ Existing data cleared.");

    // 2. 임베딩 생성 및 Insert
    console.log(`⏳ Processing ${safetyLawsData.length} records...`);
    
    for (const [index, law] of safetyLawsData.entries()) {
      console.log(`[${index + 1}/${safetyLawsData.length}] Generating embedding for: ${law.law_name} ${law.article_number}`);
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: law.content,
      });
      const embedding = embeddingResponse.data[0].embedding;

      const { error: insertError } = await supabase.from('safety_laws').insert({
        law_name: law.law_name,
        article_number: law.article_number,
        content: law.content,
        embedding: embedding,
        metadata: law.metadata
      });

      if (insertError) {
        console.error(`❌ Failed to insert ${law.law_name}:`, insertError.message);
      } else {
        console.log(`✅ Successfully inserted: ${law.law_name} ${law.article_number}`);
      }
    }

    console.log("🎉 Seeding complete! The database is now ready for production use.");
  } catch (err) {
    console.error("❌ Unexpected error during seeding:", err);
  }
}

seed();
