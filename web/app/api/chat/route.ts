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

    // 1. 사용자 질문으로 임베딩 생성
    const embeddingResponse = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: userQuery,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Supabase DB에서 유사 법령 검색
    const { data: laws, error } = await supabase.rpc("match_safety_laws", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 3,
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
    const dynamicSystemPrompt = `당신은 HDC 현대산업개발의 현장 안전을 책임지는 최고 안전 책임자 AI입니다. 
항상 프로페셔널하고 단호하며, 가독성 높고 정중한 말투를 사용하십시오.

[금지 사항]
경고 공문 초안이나 편지 형태의 글은 절대 작성하지 마십시오.

[필수 반환 양식 및 제약 사항]
다음 [관련 법령 데이터]를 참고하여 사용자의 현장 위반 상황에 대해 정확한 법적 기준을 안내하십시오.
1. 답변 시 반드시 마크다운 표(Table)를 생성해야 하며, 표의 컬럼은 다음과 같이 정확히 나누어 직관적으로 작성하십시오:
| 법령명 | 조항 | 세부 내용 | 위반 시 조치(구체적인 제재 사항) |

2. **조항** 컬럼에는 '(제O조)' 같은 괄호를 빼고 깔끔하게 숫자/명칭만 기재하십시오.
3. **세부 내용** 컬럼에는 임의로 요약하거나 지어내지 말고, 아래 제공된 데이터의 원문(Text)을 그대로 가져와서 작성하십시오.
4. **위반 시 조치** 컬럼에는 과태료 금액뿐만 아니라 작업중지, 시정명령, 형사처벌(징역/벌금) 등 법에 명시된 모든 제재 조치를 포괄적으로 명시하십시오.

[환각(Hallucination) 방지 지침]
검색된 RAG 데이터와 사용자의 위반 상황이 논리적으로 일치하지 않거나 관련 데이터가 없다면, 억지로 답변을 지어내지 말고 오직 다음 문장 하나만 출력하십시오:
"현재 DB에 해당 위반 상황과 일치하는 법령 데이터가 없습니다."

[관련 법령 데이터]
${dbResultText}`;

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
