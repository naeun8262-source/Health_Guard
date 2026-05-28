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

다음 법령 데이터를 참고하여 사용자의 현장 위반 상황에 대해 정확한 법적 기준을 안내하고, 필요한 경우 작업중지 및 과태료 경고 공문 초안을 작성해주세요.
데이터가 없을 경우 "해당하는 법령 검색 결과가 없습니다"라고 대답하십시오.
내용은 표나 목록을 사용하여 깔끔하게 정리하여 보여주세요.

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
