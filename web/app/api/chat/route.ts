export const dynamic = 'force-dynamic';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

// Vercel 환경에서 환경변수 로드
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '') || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("SUPABASE_URL or SUPABASE_KEY is missing. Using placeholder to prevent build crash.");
}

// Next.js 빌드 중 환경변수가 없을 때 아래의 방어코드가 작동
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeSupabaseKey = supabaseKey || 'placeholder';

const supabase = createClient(safeSupabaseUrl, safeSupabaseKey);

// Vercel Serverless Edge Runtime은 지원 가능하지만 Supabase 등을 위해 nodejs 런타임을 유지
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;

    console.log('[RAG] User Query:', userQuery);

    const { OpenAI } = await import('openai');
    const openaiClient = new OpenAI({ apiKey: openaiApiKey });

    // 0. LLM을 통한 검색 쿼리 확장 (Query Expansion)
    const expansionPrompt = `다음 사용자의 현장 위반 상황이나 질문에 대해, 산업안전보건법 및 관련 규칙에서 검색하기 좋은 핵심 키워드(예: 보호구, 안전모, 밀폐공간, 추락, 송기마스크 등)와 관련 조항 번호가 있다면 포함하여 1~2문장의 풍부한 검색용 자연어 쿼리로 확장해주세요.
사용자 질문: "${userQuery}"
검색 쿼리:`;

    let expandedQuery = userQuery;
    try {
      const expansionResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: expansionPrompt }],
        temperature: 0,
      });
      expandedQuery = expansionResponse.choices[0].message.content || userQuery;
    } catch (e) {
      console.warn("Query expansion failed, using original query", e);
    }
    console.log('[RAG] Expanded Query:', expandedQuery);

    // 1. 확장된 쿼리로 임베딩 생성
    const embeddingResponse = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: expandedQuery,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Supabase DB에서 유사 법령 검색
    const { data: laws, error } = await supabase.rpc("match_safety_laws", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
    });

    console.log('[RAG DB Result]:', laws, error);

    // 3. 검색 결과 텍스트 구성
    let dbResultText = "";
    if (error || !laws || laws.length === 0) {
      dbResultText = "관련 법령 데이터를 찾을 수 없습니다.";
    } else {
      dbResultText = "검색된 관련 법령 및 과태료 리스트입니다:\n\n";
      laws.forEach((law: any, index: number) => {
        dbResultText += `--- ${index + 1}. ${law.law_name} ${law.article_number} ---\n`;
        dbResultText += `${law.content}\n\n`;
      });
    }

    // 4. 동적 시스템 프롬프트 생성 (RAG 주입)
    const baseSystemPrompt = `당신은 HDC 현대산업개발의 현장 안전을 책임지는 최고 안전 책임자 AI입니다. 
항상 프로페셔널하고 단호하며, 가독성 높고 정중한 말투를 사용하십시오.

[금지 사항]
경고 공문 초안이나 편지 형태의 글은 절대 작성하지 마십시오.

[안전관리자의 한마디 (Ending Remark)]
모든 답변(표가 출력된 후, 또는 데이터가 없다는 답변 후)의 맨 마지막 줄(줄바꿈 후)에는, 근로자와 현장 반장님의 마음을 사로잡을 수 있는 따뜻하면서도 책임감 있는 보건관리자(또는 안전관리자)의 진심 어린 한마디를 반드시 한 줄 추가하십시오. (상황에 맞게 자동 생성)`;

    let dynamicSystemPrompt = "";

    if (error || !laws || laws.length === 0) {
      dynamicSystemPrompt = `${baseSystemPrompt}\n\n사용자의 위반 상황과 일치하는 법령 데이터를 찾지 못했습니다.\n다음 문장과 함께 안전관리자의 한마디를 출력하십시오:\n"현재 DB에 해당 위반 상황과 일치하는 법령 데이터가 없습니다."`;
    } else {
      dynamicSystemPrompt = `${baseSystemPrompt}

[필수 반환 양식 및 제약 사항]
다음 [관련 법령 데이터]를 참고하여 사용자의 현장 위반 상황에 대해 정확한 법적 기준을 안내하십시오.
1. 마크다운 표(Table) 양식 엄격 통제: 답변 시 반드시 마크다운 표를 생성해야 하며, 표의 컬럼 헤더는 괄호나 부연 설명을 완전히 배제하고 정확히 | 법령명 | 조항 | 세부 내용 | 위반 시 조치 | 이 4개로만 출력하십시오.
2. 원문 100% 복사 (절대 요약 금지): '세부 내용' 컬럼에는 DB에서 검색된 법령 텍스트를 단어 하나, 조사 하나 바꾸지 말고 100% 그대로(Verbatim) 복사해서 출력하십시오. 내용이 아무리 길어도 절대로 임의로 요약하거나, 중간에 중략(...) 기호를 쓰거나, 핵심만 발췌하지 마십시오. 무조건 검색된 원문 전체(Full Text)를 표 안에 쏟아내야 합니다.
3. '조항' 컬럼에는 '(제O조)' 같은 괄호를 빼고 깔끔하게 숫자/명칭만 기재하십시오.
4. '위반 시 조치' 컬럼에는 과태료 금액뿐만 아니라 작업중지, 시정명령, 형사처벌(징역/벌금) 등 법에 명시된 모든 제재 조치를 포괄적으로 명시하십시오.

[마크다운 텍스트 스타일링 규칙]
사용자가 보는 화면에서 가독성을 높이기 위해, 출력되는 텍스트에 다음 마크다운 규칙을 적용하십시오:
- 법 조항 숫자: 법 제O조, 항, 호 등 조항을 나타내는 숫자 부분에는 마크다운 볼드(**)를 적용하십시오. (예: 제**38**조, 제**10**조의**2**)
- 기간 및 금액: '1년', '6개월' 등 기간과 '500만원', '1억원' 등 금액을 나타내는 글자 전체에는 마크다운 볼드(**)를 적용하십시오. (예: **5년** 이하의 징역, **1천만원** 이하의 과태료)
- 참고: 색상 적용은 프론트엔드에서 처리하므로 정확히 대상 텍스트에 **만 감싸십시오.

[환각(Hallucination) 방지 지침]
검색된 RAG 데이터와 사용자의 위반 상황이 논리적으로 전혀 일치하지 않는다면, 억지로 표를 만들거나 답변을 지어내지 말고 오직 다음 문장 하나만 출력하십시오:
"현재 DB에 해당 위반 상황과 일치하는 법령 데이터가 없습니다."

[관련 법령 데이터]
${dbResultText}`;
    }

    // 5. LLM 스트림 생성 (tools 제거됨)
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      system: dynamicSystemPrompt,
      messages,
    } as any);

    return result.toAIStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
