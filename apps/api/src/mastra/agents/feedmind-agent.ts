import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { Memory } from "@mastra/memory";
import { buildSystemPrompt } from "../prompts/system.js";
import { resolveModelClient } from "./model-cache.js";
import { getSelectedModel } from "../../modules/llms/service.js";
import { getConfig } from "../../modules/models/config-service.js";
import { askClarificationTool } from "../tools/ask-clarification.js";
import { webFetchTool } from "../tools/web-fetch.js";
import { webSearchTool } from "../tools/web-search.js";
import { wikiReadTool } from "../tools/wiki-read.js";
import { wikiSearchTool } from "../tools/wiki-search.js";
import { taskTool, getSubagentDescriptions } from "../tools/task.js";
import { createFeedMindWorkspace } from "../workspace.js";
import { cachedGet, clearCache } from "../utils/cached-get.js";
import { parseTokenCount } from "../utils/parse-token-count.js";
import { resolveChatModel } from "../utils/model-resolver.js";
import { logger } from "../../lib/logger.js";

// Supervisor 架构：所有 subagent 通过 task 工具运行时动态创建，避免编译时注册
const feedmindWorkspace = createFeedMindWorkspace();

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
      // resolveModelClient 自带缓存，避免重复 getModelRuntime 查询
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
        },
      };
    } catch (err) {
      logger.error({ err }, "获取会话配置失败，使用默认配置");
      return {};
    }
  },
  memory: new Memory(),
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

/** 供外部调用以在模型选择变更时清理缓存 */
export function clearConfigCache(): void {
  clearCache();
}
