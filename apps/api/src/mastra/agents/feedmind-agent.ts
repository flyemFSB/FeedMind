import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { Memory } from "@mastra/memory";
import { LibSQLVector } from "@mastra/libsql";
import { resolve } from "node:path";
import {
  SUPERVISOR_SYSTEM_PROMPT,
  buildDateSystemMessage,
  buildWorkspaceSystemMessage,
} from "../prompts/system.js";
import { getSelectedModel } from "../../modules/models/service.js";
import { getConfig } from "../../modules/runtime-config/config-service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { taskTool } from "../tools/task.js";
import { createFeedMindWorkspace } from "../workspace.js";
import { parseTokenCount } from "../../modules/models/parse-token-count.js";
import { resolveChatModel, resolveChatModelEntry } from "../utils/model-resolver.js";
import { resolveEmbeddingModel } from "../utils/embedder-resolver.js";
import { resolveDataDir } from "../../lib/data-dir.js";
import { logger } from "../../lib/logger.js";

const feedmindWorkspace = createFeedMindWorkspace();

// ── 记忆系统 / 观察记忆（Observational Memory） ───────────────────────
// LibSQLVector 无会话状态，跨请求共享单例；惰性初始化确保 resolveDataDir 读取到正确的 DATA_DIR
let _feedmindVector: LibSQLVector | null = null;
function getFeedmindVector(): LibSQLVector {
  if (!_feedmindVector) {
    const mastraDbUrl = `file:${resolve(resolveDataDir(), "mastra.db").replace(/\\/g, "/")}`;
    _feedmindVector = new LibSQLVector({ id: "feedmind-vector", url: mastraDbUrl });
  }
  return _feedmindVector;
}

/** 动态构造记忆层：无嵌入模型时降级为纯分页检索 */
async function buildMemory(): Promise<Memory> {
  const embedder = await resolveEmbeddingModel();
  return new Memory({
    ...(embedder ? { vector: getFeedmindVector(), embedder } : {}),
    options: {
      observationalMemory: {
        // 观察记忆后台模型动态复用当前选中聊天模型
        model: async ({ requestContext }: { requestContext?: RequestContext }) =>
          resolveChatModel(requestContext),
        // 嵌入模型可用时开启向量检索，缺省时降级为纯分页
        retrieval: embedder ? { vector: true } : true,
      },
    },
  });
}

export const feedmindAgent = new Agent({
  id: "feedmind",
  name: "FeedMind",
  description: "研究辅助 supervisor agent，负责协调搜索、wiki、浏览器等子任务。",
  // 动态构造提示词：避免长驻进程日期停滞
  instructions: async ({ requestContext }: { requestContext?: RequestContext } = {}) => {
    const wsContext = requestContext?.get("workspaceContext") as
      | Record<string, unknown>
      | undefined;
    const wsMsg = buildWorkspaceSystemMessage(wsContext);
    // 用户提示词追加在基础人格之后，读取失败时跳过
    let userPrompt = "";
    try {
      userPrompt = (await getConfig("session")).system_prompt.trim();
    } catch (err) {
      logger.warn({ err }, "读取会话系统提示词失败，跳过用户提示词层");
    }
    return [
      {
        role: "system",
        content: SUPERVISOR_SYSTEM_PROMPT,
        // 标记 Anthropic 提示词缓存断点
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      ...(userPrompt ? [{ role: "system" as const, content: userPrompt }] : []),
      buildDateSystemMessage(),
      ...(wsMsg ? [wsMsg] : []),
    ];
  },
  model: async ({ requestContext }: { requestContext?: RequestContext }) =>
    resolveChatModel(requestContext),
  defaultOptions: async ({ requestContext }: { requestContext?: RequestContext } = {}) => {
    try {
      const [cfg, selected] = await Promise.all([getConfig("session"), getSelectedModel()]);

      // 未配置模型时不解析，保留由 model 解析抛出友好报错的行为
      const entry = selected.id ? await resolveChatModelEntry(requestContext) : null;
      const maxTokens = parseTokenCount(entry?.maxOutput);

      return {
        maxSteps: 20,
        // Anthropic 会话级前缀缓存配置
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        // 记录模型 Token 用量与缓存命中统计
        onStepFinish: ({ usage, model }) => {
          logger.debug(
            {
              modelId: model?.modelId,
              inputTokens: usage?.inputTokens,
              cacheReadTokens: usage?.cachedInputTokens,
              cacheWriteTokens: usage?.cacheCreationInputTokens,
            },
            "模型调用 Token 用量统计",
          );
        },
        modelSettings: {
          // 思考模型不传 temperature 与 topP，避免上游警告
          ...(entry?.thinkingByDefault ? {} : { temperature: cfg.temperature, topP: cfg.top_p }),
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          // 运行超时上限：防单次调用挂死与工具循环失控
          timeout: { totalMs: 15 * 60_000, stepMs: 120_000 },
        },
      };
    } catch (err) {
      logger.error({ err }, "获取会话配置失败，回退为默认配置");
      return {};
    }
  },
  memory: buildMemory,
  tools: {
    askClarificationTool,
    webFetchTool,
    webSearchTool,
    wikiReadTool,
    wikiSearchTool,
    taskTool,
  },
  workspace: feedmindWorkspace,
});
