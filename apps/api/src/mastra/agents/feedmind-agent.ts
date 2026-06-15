import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { buildSystemPrompt } from "../prompts/system.js";
import { resolveModelClient } from "./model-cache.js";
import { getSelectedModel, getModelRuntime } from "../../modules/llms/service.js";
import { getConfig } from "../../modules/models/config-service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { createFeedMindWorkspace } from "../workspace.js";

const feedmindWorkspace = createFeedMindWorkspace();

// 简单 TTL 缓存，减少每次消息重复查 DB
const cache = new Map<string, { value: unknown; expiry: number }>();
const CACHE_TTL = 30_000; // 30 秒

async function cachedGet<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiry > now) return entry.value as T;
  const value = await fetch();
  cache.set(key, { value, expiry: now + CACHE_TTL });
  return value;
}

/** 解析 "128K" → 128000, "1M" → 1000000, null → undefined */
function parseTokenCount(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase().trim();
  const match = upper.match(/^([\d.]+)\s*(K|M)?$/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return undefined;
  const unit = match[2];
  if (unit === "M") return Math.round(num * 1_000_000);
  if (unit === "K") return Math.round(num * 1_000);
  return Math.round(num);
}

/**
 * FeedMind Agent — 通过 Mastra RequestContext 动态解析模型，
 * 从 runtime_config 表读取统一参数注入 AI SDK v6 标准化字段。
 */
export const feedmindAgent = new Agent({
  id: "feedmind",
  name: "FeedMind",
  instructions: buildSystemPrompt(),
  model: async ({ requestContext }: { requestContext?: RequestContext }) => {
    // 1. 优先使用请求级模型 ID（来自 header → requestContext）
    const modelId = requestContext?.get("feedmindModelId") as string | undefined;
    if (modelId) {
      try {
        const { client, modelName } = await resolveModelClient(Number(modelId));
        return client.chat(modelName);
      } catch (err) {
        console.error("[feedmind] resolveModelClient from header failed:", err);
        // fall through to fallback
      }
    }

    // 2. 回退：查询已选模型（带缓存）
    const selected = await cachedGet("getSelectedModel", () => getSelectedModel());
    if (!selected.id) {
      throw new Error(
        "No model configured. Please add an LLM model in Settings, then try again.",
      );
    }

    const { client, modelName } = await resolveModelClient(selected.id);
    return client.chat(modelName);
  },
  defaultOptions: async () => {
    try {
      const [cfg, selected] = await Promise.all([
        cachedGet("getConfig:session", () => getConfig("session")),
        cachedGet("getSelectedModel", () => getSelectedModel()),
      ]);

      let maxTokens: number | undefined;
      if (selected.id) {
        const runtime = await getModelRuntime(selected.id);
        maxTokens = parseTokenCount(runtime.max_output);
      }

      return {
        modelSettings: {
          temperature: cfg.temperature,
          topP: cfg.top_p,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
      };
    } catch (err) {
      console.error("[feedmind] getConfig(\"session\") failed:", err);
      return {};
    }
  },
  tools: {
    askClarificationTool,
    webFetchTool,
    webSearchTool,
    wikiReadTool,
    wikiSearchTool,
  },
  workspace: feedmindWorkspace,
});

/** 供外部调用以在模型选择变更时清理缓存 */
export function clearConfigCache(): void {
  cache.clear();
}
