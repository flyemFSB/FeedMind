import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { agentEnv } from "../env.js";

// Jina AI Reader API 网页抓取工具：将 URL 内容转为 Markdown 供 LLM 消费
// 免费版无需 API Key，有 Key 时通过 Authorization 头获得更高频率限制
export const webFetchTool = tool(
  async ({ url }) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Return-Format": "markdown",
        "X-Timeout": "10",
      };
      if (agentEnv.JINA_API_KEY) headers.Authorization = `Bearer ${agentEnv.JINA_API_KEY}`;

      const response = await fetch("https://r.jina.ai/", {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // 非 2xx 仍返回给模型，不抛异常避免中断流
        return JSON.stringify({
          error: "WEB_FETCH_FAILED",
          url,
          status: response.status,
          message: await response.text(),
        });
      }

      // 截断至 4K 字符避免超长内容挤占模型上下文窗口
      const text = await response.text();
      return text.trim()
        ? text.slice(0, 4096)
        : JSON.stringify({ error: "WEB_FETCH_EMPTY", url });
    } catch (error) {
      // 工具失败返回给模型处理，避免一次网络异常中断整条 LangGraph 流
      return JSON.stringify({
        error: "WEB_FETCH_FAILED",
        url,
        message: error instanceof Error ? error.message : "Unknown fetch error",
      });
    }
  },
  {
    name: "web_fetch",
    description:
      "Fetch the contents of an exact URL returned by web_search or provided directly by the user.",
    schema: z.object({
      url: z.string().url().describe("The exact URL to fetch. It must include http:// or https://."),
    }),
  },
);
