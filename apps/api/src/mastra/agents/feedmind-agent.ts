import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { Memory } from "@mastra/memory";
import { LibSQLVector } from "@mastra/libsql";
import { resolve } from "node:path";
import { buildSystemPrompt } from "../prompts/system.js";
import { resolveModelClient } from "../../modules/models/model-cache.js";
import { getSelectedModel } from "../../modules/models/service.js";
import { getConfig } from "../../modules/models/config-service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { taskTool, getSubagentDescriptions } from "../tools/task.js";
import { createFeedMindWorkspace } from "../workspace.js";
import { cachedGet, clearCache } from "../utils/cached-get.js";
import { parseTokenCount } from "../../modules/models/parse-token-count.js";
import { resolveChatModel } from "../utils/model-resolver.js";
import { resolveEmbeddingModel } from "../utils/embedder-resolver.js";
import { resolveDataDir } from "../../lib/data-dir.js";
import { logger } from "../../lib/logger.js";

const feedmindWorkspace = createFeedMindWorkspace();

// ── Memory / Observational Memory ─────────────────────────────────────────
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
 * 未配置 embedding 模型时 vector/embedder 缺省，OM 的 retrieval.vector 自动降级
 * 为纯分页 recall（hasSemanticSearch 关闭），聊天主链路不受影响。
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
  instructions:
    buildSystemPrompt(`你是 FeedMind，面向研究任务的 AI 助手。你可以使用自身工具或通过 task 工具创建专用 subagent 来完成任务。

## 自身工具
- web_search / web_fetch — 搜索和抓取网络信息
- wiki_search / wiki_read — 查询本地知识库
- ask_clarification — 用户意图模糊时提问澄清

## task 工具 — 动态创建 subagent
当任务可分解为独立子任务时，使用 task 工具创建专用 subagent：

${getSubagentDescriptions()}

## 委托规则
1. 简单搜索、wiki 查询 → 使用自身工具（web_search / web_fetch / wiki_search）
2. 深度多来源研究 → 使用 task(researcher)
3. 数据提取、页面解析 → 使用 task(extractor)
4. 长文本总结 → 使用 task(summarizer)
5. 浏览器交互（JS 渲染、点击、表单） → 使用 task(browser)
6. 多个独立子任务可以在同一步骤中并行执行
7. 委托后结合 subagent 返回的结果给出最终回答

规则：
- 不编造来源；搜索无可用结果时，说明依据不是搜索结果。
- 回答清晰、结构化、可执行。
- 调用工具时，数组参数必须传 JSON 数组（如 ["a","b"]），数字必须传数字不要传字符串。`),
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
      logger.error({ err }, "获取会话配置失败，使用默认配置");
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

export function clearConfigCache(): void {
  clearCache();
}
