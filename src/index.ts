import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";

// 환경변수 로드
dotenv.config();

// 환경변수 확인
let supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL 또는 SUPABASE_KEY가 환경변수에 설정되지 않았습니다.");
  process.exit(1);
}

// Supabase URL에서 /rest/v1/ 부분이 포함되어 있다면 제거
supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');

if (!openaiApiKey) {
  console.error("❌ OPENAI_API_KEY가 환경변수에 설정되지 않았습니다.");
  process.exit(1);
}

// 클라이언트 초기화
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function main() {
  console.log("🚀 실시간 과태료/형벌 리스크 경고 MCP 서버를 시작합니다...");

  // Supabase 연결 테스트
  try {
    const { data, error } = await supabase.from("safety_laws").select("id").limit(1);
    if (error) {
      throw error;
    }
    console.log("✅ Supabase DB 연결에 성공했습니다.");
  } catch (error) {
    console.error("⚠️ Supabase DB 연결 실패(또는 테이블 없음). 서버는 계속 실행됩니다:", error);
    // process.exit(1) 제거하여 서버가 뻗지 않게 함
  }

  // MCP 서버 초기화
  const server = new McpServer({
    name: "health-guard-mcp",
    version: "1.0.0",
  });

  // 1. search_safety_law 도구 등록
  server.tool(
    "search_safety_law",
    "현장 위반 상황(예: '안전모 미착용')에 대한 관련 법령 및 과태료 기준을 검색합니다.",
    {
      situation: z.string().describe("현장 위반 상황에 대한 상세 설명"),
    },
    async ({ situation }) => {
      try {
        // 1) 상황을 임베딩
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: situation,
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;

        // 2) Supabase RPC 함수 (match_safety_laws) 호출하여 검색
        const { data: laws, error } = await supabase.rpc("match_safety_laws", {
          query_embedding: queryEmbedding,
          match_threshold: 0.5,
          match_count: 3,
        });

        if (error) {
          throw error;
        }

        if (!laws || laws.length === 0) {
          return {
            content: [{ type: "text", text: "해당 상황에 일치하는 관련 법령 및 과태료 기준을 찾을 수 없습니다." }],
          };
        }

        // 3) 검색 결과 포맷팅
        let resultText = `[위반 상황: ${situation}]\n\n검색된 관련 법령 및 과태료 리스크입니다:\n\n`;
        laws.forEach((law: any, index: number) => {
          resultText += `--- ${index + 1}. ${law.law_name} ${law.article_number} ---\n`;
          resultText += `${law.content}\n\n`;
        });

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error: any) {
        console.error("search_safety_law 실행 중 오류:", error);
        return {
          content: [{ type: "text", text: `검색 중 오류가 발생했습니다: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. draft_warning_letter 도구 등록
  server.tool(
    "draft_warning_letter",
    "검색된 법령 및 리스크를 바탕으로 협력업체 소장에게 발송할 작업중지 및 과태료 경고 공문 초안을 작성합니다.",
    {
      situation: z.string().describe("위반 상황 내용"),
      law_results: z.string().describe("검색된 법령 및 과태료 기준 내용"),
      company_name: z.string().optional().describe("수신 협력업체 이름 (선택)"),
    },
    async ({ situation, law_results, company_name }) => {
      try {
        const prompt = `
당신은 건설현장의 최고 안전 책임자입니다.
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
5. 매우 단호하고 전문적인 어조를 사용할 것.
`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const letterDraft = completion.choices[0]?.message?.content || "초안 작성에 실패했습니다.";

        return {
          content: [{ type: "text", text: letterDraft }],
        };
      } catch (error: any) {
        console.error("draft_warning_letter 실행 중 오류:", error);
        return {
          content: [{ type: "text", text: `공문 초안 작성 중 오류가 발생했습니다: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Stdio 전송을 사용하여 서버 시작
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log("✅ MCP 서버가 정상적으로 시작되었습니다.");
}

main().catch((error) => {
  console.error("서버 실행 중 치명적인 오류 발생:", error);
  process.exit(1);
});
