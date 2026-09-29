import { Agent } from "@mastra/core/agent";
import { SkillSearchProcessor } from "@mastra/core/processors";
import type { InputProcessorOrWorkflow } from "@mastra/core/processors";
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
import { getRuntimeConfig } from "../../modules/runtime-config/config-service.js";
import { askUserTool } from "@mastra/core/tools";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiListPagesTool } from "../tools/wiki-list-pages.js";
import { wikiListSpacesTool } from "../tools/wiki-list-spaces.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { taskTool } from "../tools/task.js";
import { createFeedMindWorkspace } from "../workspace.js";
import { parseTokenCount } from "../../modules/models/parse-token-count.js";
import { resolveChatModel, resolveChatModelEntry } from "../utils/model-resolver.js";
import { createLlmRetryProcessor } from "../utils/retry-processor.js";
import { resolveEmbeddingModel } from "../utils/embedder-resolver.js";
import { buildObservationalMemoryConfig } from "../utils/observation-memory-config.js";
import { recordChatUsage } from "../utils/chat-usage-tracker.js";
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

// 记忆层实例按模型维度缓存，保持后台观察状态与串行锁稳定
let _memoryCache: { key: string; memory: Memory } | null = null;

/** 动态构造记忆层：无嵌入模型时降级为纯分页检索 */
async function buildMemory(): Promise<Memory> {
  const embedder = await resolveEmbeddingModel();
  const cacheKey = embedder ? `${embedder.provider}/${embedder.modelId}` : "paged";
  if (_memoryCache?.key === cacheKey) return _memoryCache.memory;

  const memory = new Memory({
    ...(embedder ? { vector: getFeedmindVector(), embedder } : {}),
    options: {
      observationalMemory: buildObservationalMemoryConfig({
        hasEmbedder: Boolean(embedder),
        // 观察记忆后台复用当前聊天模型
        model: async ({ requestContext }: { requestContext?: RequestContext }) =>
          resolveChatModel(requestContext),
      }),
    },
  });
  _memoryCache = { key: cacheKey, memory };
  return memory;
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
      userPrompt = (await getRuntimeConfig("chat")).system_prompt.trim();
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
  errorProcessors: [createLlmRetryProcessor()],
  inputProcessors: [
    // 渐进式披露技能，按需检索以避免全量注入撑大上下文
    new SkillSearchProcessor({
      workspace: feedmindWorkspace,
      search: { topK: 5, minScore: 0.1 },
      // 规避上游类型在严格可选属性检查下的赋值限制
    }) as unknown as InputProcessorOrWorkflow,
  ],
  defaultOptions: async ({ requestContext }: { requestContext?: RequestContext } = {}) => {
    try {
      const [cfg, selected] = await Promise.all([
        getRuntimeConfig("chat"),
        getSelectedModel("chat"),
      ]);

      // 未配置模型时不解析，保留由 model 解析抛出友好报错的行为
      const entry = selected.id ? await resolveChatModelEntry(requestContext) : null;
      const maxTokens = parseTokenCount(entry?.maxOutput);

      const mastraMemory = requestContext?.get("MastraMemory") as
        | { thread?: { id?: string } }
        | undefined;
      const threadId =
        (requestContext?.get("threadId") as string | undefined) ?? mastraMemory?.thread?.id;

      return {
        maxSteps: 20,
        // 用户下一条消息即澄清回答：由 agent 从消息历史抽取 resumeData 自动续跑被挂起的工具
        autoResumeSuspendedTools: true,
        // Anthropic 会话级前缀缓存配置
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        // 记录模型 Token 用量与缓存命中统计
        onStepFinish: ({ usage, model }) => {
          if (usage && threadId) {
            recordChatUsage(threadId, {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
              cachedInputTokens: usage.cachedInputTokens,
            });
          }
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
          // 禁用内部隐式重试，统一由 errorProcessors 调度
          maxRetries: 0,
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
  // 内置工具参数精简，直接常驻注册以降低检索开销
  tools: {
    [askUserTool.id]: askUserTool,
    [webFetchTool.id]: webFetchTool,
    [webSearchTool.id]: webSearchTool,
    [wikiListSpacesTool.id]: wikiListSpacesTool,
    [wikiListPagesTool.id]: wikiListPagesTool,
    [wikiReadTool.id]: wikiReadTool,
    [wikiSearchTool.id]: wikiSearchTool,
    [taskTool.id]: taskTool,
  },
  workspace: feedmindWorkspace,
});
