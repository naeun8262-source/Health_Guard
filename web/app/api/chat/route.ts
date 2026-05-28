import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getMcpClient } from '@/lib/mcpClient';

// Vercel AI SDK Edge runtime을 사용하지 않고 node runtime 사용
// MCP Client (stdio)는 Node.js 런타임에서만 동작함
export const runtime = 'nodejs';

// MCP 도구들을 AI SDK 도구로 변환하는 헬퍼 함수
async function mapMcpToolsToAiTools(client: any) {
  const toolsResponse = await client.listTools();
  const tools: Record<string, any> = {};

  for (const mcpTool of toolsResponse.tools) {
    tools[mcpTool.name] = {
      description: mcpTool.description || `Tool ${mcpTool.name}`,
      parameters: mcpTool.inputSchema,
      execute: async (args: any) => {
        try {
          console.log(`Executing MCP Tool: ${mcpTool.name} with args:`, args);
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: args,
          });

          if (result.isError) {
            console.error(`Error in tool ${mcpTool.name}:`, result.content);
            return { error: result.content.map((c: any) => c.text).join('\n') };
          }
          
          return { result: result.content.map((c: any) => c.text).join('\n') };
        } catch (error: any) {
          console.error(`MCP Tool execution failed:`, error);
          return { error: error.message };
        }
      },
    };
  }

  return tools;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    const mcpClient = await getMcpClient();
    const aiTools = await mapMcpToolsToAiTools(mcpClient);

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: `당신은 HDC 현대산업개발의 현장 안전을 돕는 최고 안전 책임자 AI입니다. 
항상 프로페셔널하고 단호하며, 가독성 높고 정중한 어투를 사용하십시오.
제공된 도구(search_safety_law, draft_warning_letter)를 적극 활용하여 현장 위반 상황에 대한 정확한 법적 기준을 안내하고 필요한 경우 경고 공문을 작성해주세요.
도구를 사용한 후에는 사용자에게 결과를 깔끔하게 정리하여 보여주세요.`,
      messages,
      tools: aiTools,

    });

    return (result as any).toDataStreamResponse ? (result as any).toDataStreamResponse() : (result as any).toAIStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
