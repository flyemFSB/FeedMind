/**
 * AnySearch 搜索引擎 —— MCP Streamable HTTP 客户端。
 * 连接 AnySearch MCP Server (https://api.anysearch.com/mcp) 调用搜索工具。
 * 无需 API Key 即可使用（匿名模式受速率和日配额限制）。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const MCP_URL = "https://api.anysearch.com/mcp";
const CLIENT_INFO = { name: "feedmind", version: "0.1.0" };

interface McpTextContent {
  type: "text";
  text: string;
}

interface McpSearchResult {
  title: string;
  url: string;
  content: string;
}

function parseResults(content: unknown[]): McpSearchResult[] {
  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      (item as McpTextContent).type === "text" &&
      "text" in item
    ) {
      const text = (item as McpTextContent).text;
      try {
        const parsed = JSON.parse(text);
        const results = parsed?.data?.results ?? parsed?.results ?? parsed;
        if (Array.isArray(results)) {
          return results.map((r: Record<string, unknown>) => ({
            title: String(r["title"] ?? r["name"] ?? ""),
            url: String(r["url"] ?? r["link"] ?? ""),
            content: String(r["content"] ?? r["description"] ?? r["snippet"] ?? ""),
          }));
        }
      } catch {
        // 不是 JSON，尝试按行解析
        const lines = text.split("\n").filter(Boolean);
        return lines.map((line) => {
          const match = line.match(/^\[(.+?)\]\((.+?)\)\s*-?\s*(.*)/);
          if (match) {
            return { title: match[1] ?? "", url: match[2] ?? "", content: match[3] ?? "" };
          }
          return { title: line, url: "", content: "" };
        });
      }
    }
  }
  return [];
}

export async function anysearchSearch(
  query: string,
  maxResults: number,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<McpSearchResult[]> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers },
  });

  const client = new Client(CLIENT_INFO, { capabilities: {} });

  try {
    // SDK 的 StreamableHTTPClientTransport 在 exactOptionalPropertyTypes 下与 Transport 接口
    // 结构不兼容（可选字段带 | undefined），运行时实现是完整的，此处显式断言
    await client.connect(transport as Transport);

    // 列出可用工具，先找 search 工具
    const { tools } = await client.listTools();
    const searchTool = tools.find(
      (t) => t.name === "search" || t.name === "web_search" || t.name === "anysearch_search",
    );

    if (!searchTool) {
      throw new Error(
        `No search tool found on AnySearch MCP server. Available: ${tools.map((t) => t.name).join(", ") || "(none)"}`,
      );
    }

    const result = await client.callTool(
      {
        name: searchTool.name,
        arguments: { query, max_results: maxResults },
      },
      undefined,
      { ...(signal ? { signal } : {}) },
    );

    const content = Array.isArray(result.content) ? result.content : [];
    const results = parseResults(content);

    if (results.length > 0) {
      return results;
    }

    // 兜底：把原始 text content 作为一条结果返回
    for (const item of content) {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        (item as McpTextContent).type === "text"
      ) {
        const text = (item as McpTextContent).text;
        if (text.trim()) {
          return [{ title: "Search Results", url: "", content: text }];
        }
      }
    }

    return [];
  } finally {
    await client.close().catch(() => {});
  }
}
