import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";

// 글로벌 캐싱 객체 (Next.js 개발 서버 핫 리로드 방어)
declare global {
  var _mcpClient: Client | null;
}

export async function getMcpClient() {
  if (global._mcpClient) {
    return global._mcpClient;
  }

  console.log("Connecting to MCP server...");
  const isWin = process.platform === "win32";
  const command = isWin ? "npx.cmd" : "npx";

  // web/ 폴더에서 상위 폴더(루트)의 tsconfig와 index.ts 지정
  const rootDir = path.resolve(process.cwd(), "..");
  const indexTs = path.join(rootDir, "src", "index.ts");
  const tsConfig = path.join(rootDir, "tsconfig.json");
  const dotEnv = path.join(rootDir, ".env");

  // 상위 폴더의 환경변수 로딩을 위해 dotenv 수동 로드가 필요할 수 있음
  // 하지만 MCP 서버 내에서 `dotenv.config()`를 호출하므로, 작업 디렉토리가 맞다면 로드됨.
  // 상위 폴더를 참조하도록 보장하기 위해 env.NODE_OPTIONS 에 --require dotenv/config 를 넣을 수도 있지만,
  // MCP 서버 안에서 dotenv.config({ path: '../.env' }) 가 필요할 수도 있음.
  // 안전하게 상위 폴더의 SUPABASE_URL 등을 넘겨준다.
  import("dotenv").then((dotenv) => {
    dotenv.config({ path: dotEnv });
  });

  const mcpTransport = new StdioClientTransport({
    command: command,
    args: ["ts-node", "--project", tsConfig, indexTs],
    env: { ...process.env } as Record<string, string>
  });

  const client = new Client(
    {
      name: "health-guard-nextjs-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(mcpTransport);
  global._mcpClient = client;
  console.log("MCP client connected successfully.");

  return client;
}
