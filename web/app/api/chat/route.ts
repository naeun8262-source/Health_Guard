import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Vercel 환경에서 환경변수 로드
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '') || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("SUPABASE_URL or SUPABASE_KEY is missing. Using placeholder to prevent build crash.");
}

// Next.js 빌드 시(환경변수가 없을 때) 크래시 방지용 더미 값
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeSupabaseKey = supabaseKey || 'placeholder';

const supabase = createClient(safeSupabaseUrl, safeSupabaseKey);

// Vercel Serverless Edge Runtime 도 지원 가능하지만, Supabase 등을 위해 nodejs 런타임을 유지
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const aiTools = {
    search_safety_law: tool({
      description: "현장 위반 상황(예: '안전모 미착용')에 대한 관련 법령 및 과태료 기준을 검색합니다.",
      parameters: z.object({
        situation: z.string().describe("현장 위반 상황에 대한 상세 설명"),
      }),
      execute: async ({ situation }: { situation: string }) => {
        try {
          // 1. 임베딩 생성 (Edge/Node 환경을 위해 fetch를 직접 쓸 수도 있지만, @ai-sdk/openai 내부 객체를 쓰거나 별도로 openai client 필요)
          // 하지만 우리는 이미 @ai-sdk/openai에서 제공하는 메서드를 사용할 수 있습니다.
          // 편의상 기본 제공되는 OpenAI 클라이언트 대신 fetch를 활용하거나 openai package를 사용합니다.
          // 패키지 의존성을 최소화하기 위해 글로벌 openai 인스턴스를 사용하거나 내장 메서드 활용.
          // 여기서 우리는 이미 package.json에 `openai` 가 있으므로 임포트해서 씁니다.
          const { OpenAI } = await import('openai');
          const openaiClient = new OpenAI({ apiKey: openaiApiKey });

          const embeddingResponse = await openaiClient.embeddings.create({
            model: "text-embedding-3-small",
            input: situation,
          });
          const queryEmbedding = embeddingResponse.data[0].embedding;

          // 2. Supabase 검색
          const { data: laws, error } = await supabase.rpc("match_safety_laws", {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 3,
          });

          if (error) throw error;

          if (!laws || laws.length === 0) {
            return "해당 상황에 일치하는 관련 법령 및 과태료 기준을 찾을 수 없습니다.";
          }

          let resultText = `[위반 상황: ${situation}]\n\n검색된 관련 법령 및 과태료 리스크입니다:\n\n`;
          laws.forEach((law: any, index: number) => {
            resultText += `--- ${index + 1}. ${law.law_name} ${law.article_number} ---\n`;
            resultText += `${law.content}\n\n`;
          });

          return resultText;
        } catch (e: any) {
          return `검색 중 오류가 발생했습니다: ${e.message}`;
        }
      }
    } as any),

    draft_warning_letter: tool({
      description: "검색된 법령 및 리스크를 바탕으로 협력업체 소장에게 발송할 작업중지 및 과태료 경고 공문 초안을 작성합니다.",
      parameters: z.object({
        situation: z.string().describe("위반 상황 내용"),
        law_results: z.string().describe("검색된 법령 및 과태료 기준 내용"),
        company_name: z.string().optional().describe("수신 협력업체 이름 (선택)"),
      }),
      execute: async ({ situation, law_results, company_name }: { situation: string; law_results: string; company_name?: string }) => {
        try {
          const { OpenAI } = await import('openai');
          const openaiClient = new OpenAI({ apiKey: openaiApiKey });

          const prompt = `당신은 건설현장의 최고 안전 책임자입니다.
다음의 위반 상황과 관련 법령 리스크를 바탕으로, 협력업체 현장소장에게 발송할 강력하고 전문적인 [작업중지 및 과태료 경고 공문] 초안을 작성해주세요.

[위반 상황]
${situation}

[관련 법령 및 리스크]
${law_results}

${company_name ? `[수신처]\n${company_name} 현장소장 귀하\n` : ""}
[요구사항]
1. 공문의 형식을 갖출 것 (제목, 수신, 발신, 본문, 결론).
2. 위반 행위로 인해 발생할 수 있는 법적 리스크(과태료 등)를 명확히 경고할 것.
3. 즉각적인 시정 조치 및 재발 방지 대책 제출을 요구할 것.
4. 필요시 작업중지 조치가 포함됨을 명시할 것.
5. 매우 단호하고 전문적인 어조를 사용할 것.`;

          const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
          });

          return completion.choices[0]?.message?.content || "초안 작성에 실패했습니다.";
        } catch (e: any) {
          return `공문 초안 작성 중 오류가 발생했습니다: ${e.message}`;
        }
      }
    } as any),
  };

  try {
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: `당신은 HDC 현대산업개발의 현장 안전을 돕는 최고 안전 책임자 AI입니다. 
항상 프로페셔널하고 단호하며, 가독성 높고 정중한 어투를 사용하십시오.
제공된 도구(search_safety_law, draft_warning_letter)를 적극 활용하여 현장 위반 상황에 대한 정확한 법적 기준을 안내하고 필요한 경우 경고 공문을 작성해주세요.
도구를 사용한 후에는 사용자에게 결과를 깔끔하게 정리하여 보여주세요.`,
      messages,
      tools: aiTools,
      maxSteps: 5,
    });

    return (result as any).toDataStreamResponse ? (result as any).toDataStreamResponse() : (result as any).toAIStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
