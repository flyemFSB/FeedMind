import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { Memory } from "@mastra/memory";
import { LibSQLVector } from "@mastra/libsql";
import { resolve } from "node:path";
import { SUPERVISOR_SYSTEM_PROMPT, buildDateSystemMessage } from "../prompts/system.js";
import { resolveModelClient } from "../../modules/models/model-cache.js";
import { getSelectedModel } from "../../modules/models/service.js";
import { getConfig } from "../../modules/runtime-config/config-service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { taskTool } from "../tools/task.js";
import { createFeedMindWorkspace } from "../workspace.js";
import { cachedGet } from "../utils/cached-get.js";
import { parseTokenCount } from "../../modules/models/parse-token-count.js";
import { resolveChatModel } from "../utils/model-resolver.js";
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

/**
 * memory 用函数形式（Mastra 每请求解析一次）：embedder 需异步查模型表，静态构造拿不到。
 * 解析结果经 cachedGet 30s TTL 缓存，配置变更后自动生效。
 * 未配置向量嵌入模型时 vector 与 embedder 缺省，观察记忆（OM）的 retrieval.vector
 * 自动降级为纯分页检索召回（关闭语义检索 hasSemanticSearch），聊天主链路不受影响。
 * storage 不在此传：Mastra 在 getMemory 时注入全局 LibSQLStore（同一 mastra.db）。
 */
async function buildMemory(): Promise<Memory> {
  const embedder = await resolveEmbeddingModel();
  return new Memory({
    ...(embedder ? { vector: getFeedmindVector(), embedder } : {}),
    options: {
      observationalMemory: {
        // 观察/反射后台模型：复用当前选中聊天模型（OM 的 model 支持函数动态解析，
        // 与 Agent.model 同一签名）；未来可改用独立 flash 档模型降低后台成本。
        model: async ({ requestContext }: { requestContext?: RequestContext }) =>
          resolveChatModel(requestContext),
        // recall 工具：允许 agent 翻阅观察组背后的原始消息；分页不需要向量，
        // 仅 embedder 可用时附带语义搜索（retrieval.vector 要求 vector store 存在，
        // 无 embedder 时传 true 而非 { vector: true }，否则 Memory 构造即抛错）。
        // scope 保持默认 thread：resource 是实验特性且与异步缓冲不兼容。
        retrieval: embedder ? { vector: true } : true,
      },
    },
  });
}

export const feedmindAgent = new Agent({
  id: "feedmind",
  name: "FeedMind",
  description: "研究辅助 supervisor agent，负责协调搜索、wiki、浏览器等子任务。",
  // 函数形式：静态段永远字节相同（缓存断点落在它上面），日期段排在断点之后；
  // 写死在模块顶层会让长驻进程的日期停在启动那天
  instructions: () => [
    {
      role: "system",
      content: SUPERVISOR_SYSTEM_PROMPT,
      // Anthropic 显式断点：缓存「工具定义 + 静态提示词」这一层。
      // 按 Anthropic 的失效层级，之后消息如何变化都不会失效该层
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    buildDateSystemMessage(),
  ],
  model: async ({ requestContext }: { requestContext?: RequestContext }) =>
    resolveChatModel(requestContext),
  defaultOptions: async () => {
    try {
      const [cfg, selected] = await Promise.all([
        cachedGet("getConfig:session", () => getConfig("session")),
        cachedGet("getSelectedModel", () => getSelectedModel()),
      ]);

      let maxTokens: number | undefined;
      if (selected.id) {
        const resolved = await resolveModelClient(selected.id);
        maxTokens = parseTokenCount(resolved.maxOutput);
      }

      return {
        maxSteps: 20,
        // 提示词缓存：Anthropic 必须显式开启（顶层 cache_control = 自动缓存，断点自动落在
        // 最后一个可缓存块并随会话前移）；其余 provider 服务端默认开启前缀缓存，忽略该 key
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        // 缓存命中观测：cacheReadTokens 应随会话推进而增长，恒为 0 说明前缀被某处改写
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
          temperature: cfg.temperature,
          topP: cfg.top_p,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          // 运行硬上限（core 1.60+）：stepMs 防单次 LLM 调用挂死，totalMs 防工具循环失控。
          // 深度研究任务合法耗时可达数分钟，故给足余量而非激进值。
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
