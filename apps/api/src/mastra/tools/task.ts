import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch.js";
import { wikiSearchTool } from "./wiki-search.js";
import { wikiReadTool } from "./wiki-read.js";
import { askClarificationTool } from "./ask-clarification.js";
import { browserTemplate } from "../subagents/builtins/browser.js";
import { resolveChatModel } from "../utils/model-resolver.js";

/* -------------------------------------------------------------------------- */
/*  类型定义                                                                  */
/* -------------------------------------------------------------------------- */

export type SubagentType = "researcher" | "extractor" | "summarizer" | "browser";

import type { AgentBrowser } from "@mastra/agent-browser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolMap = Record<string, any>;

export interface SubagentTemplate {
  type: SubagentType;
  name: string;
  description: string;
  getInstructions(): string;
  getTools(): ToolMap;
  getBrowser?(): AgentBrowser;
  maxSteps?: number;
}

export interface SubagentChildToolCall {
  toolName: string;
  toolCallId?: string | undefined;
  args?: unknown;
  result?: unknown;
  isError?: boolean | undefined;
}

export interface TaskToolResult {
  taskId: string;
  type: SubagentType;
  prompt: string;
  context?: string | undefined;
  result: string;
  duration: number;
  childTools?: SubagentChildToolCall[] | undefined;
  usage?:
    | {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }
    | undefined;
}

/* -------------------------------------------------------------------------- */
/*  Subagent 注册表                                                          */
/* -------------------------------------------------------------------------- */

const subagentRegistry: Record<SubagentType, SubagentTemplate> = {
  researcher: {
    type: "researcher",
    name: "Researcher",
    description:
      "深度研究员，擅长通过网络搜索、网页抓取和 wiki 查询进行多角度信息收集与整理。适用于需要查找多个来源、对比不同观点、收集最新信息的场景。",
    getInstructions() {
      return `你是 FeedMind 深度研究员，专注于多角度信息收集与分析。

你的核心能力：
- 使用 web_search 搜索互联网获取最新信息
- 使用 web_fetch 抓取具体网页内容
- 使用 wiki_search / wiki_read 查询知识库

工作方法：
1. 先通过 web_search 找到相关信息的多个来源
2. 对于关键来源，使用 web_fetch 获取完整内容
3. 对比不同来源的信息，识别共识和分歧
4. 整理成结构化的研究报告

规则：
- 明确标注信息来源 URL
- 区分事实与观点
- 如果信息不足，诚实说明局限性`;
    },
    getTools() {
      return { webSearchTool, webFetchTool, wikiSearchTool, wikiReadTool };
    },
    maxSteps: 20,
  },

  extractor: {
    type: "extractor",
    name: "Extractor",
    description:
      "数据提取器，擅长从网页内容或文本中提取结构化信息。适用于需要解析页面内容、提取特定字段、整理数据的场景。",
    getInstructions() {
      return `你是 FeedMind 数据提取器，专注于从内容中提取结构化信息。

你的核心能力：
- 使用 web_fetch 获取需要解析的页面内容
- 从文本中提取特定字段和结构化数据
- 将非结构化内容转换为结构化格式

工作方法：
1. 获取需要解析的源内容
2. 根据需求提取关键字段和信息
3. 以结构化格式组织输出（如 JSON、表格等）

规则：
- 精确提取，不添加源内容中没有的信息
- 对于模糊或缺失的字段，明确标注
- 保留原始内容的上下文`;
    },
    getTools() {
      return { webFetchTool, askClarificationTool };
    },
    maxSteps: 20,
  },

  summarizer: {
    type: "summarizer",
    name: "Summarizer",
    description:
      "文本摘要器，擅长对长文本、多段内容或复杂信息进行总结、归纳和综合提炼。适用于需要将大量信息浓缩为简洁摘要的场景。",
    getInstructions() {
      return `你是 FeedMind 文本摘要器，专注于信息提炼与综合。

你的核心能力：
- 对长文本进行精炼摘要
- 综合多个来源的内容
- 提取关键观点和论据
- 按不同粒度输出摘要（一句话、段落、多段）

规则：
- 保持关键信息的准确性和完整性
- 不添加原文中没有的信息
- 保留原文的 nuance 和限定条件
- 对于有争议的内容，呈现多方观点`;
    },
    getTools() {
      return {};
    },
    maxSteps: 20,
  },

  browser: browserTemplate,
};

/* -------------------------------------------------------------------------- */
/*  Task 工具                                                                 */
/* -------------------------------------------------------------------------- */

let taskCounter = 0;

/**
 * task 工具 — 动态创建 subagent 来执行特定子任务。
 *
 * 借鉴 DeerFlow 的 task() 工具设计，运行时从注册表查找预置的 subagent 模板，
 * 动态创建 Agent 实例并执行，返回结果。
 *
 * 职责边界：
 * - task tool：模型解析、Agent 实例化、执行控制
 * - subagent 模板：指令（做什么）+ 工具（用什么做）
 * - 模型选择统一由 task tool 管理，模板不关心具体模型
 */
export const taskTool = createTool({
  id: "task",
  description: `动态创建专用 subagent 来执行一个子任务。当你有一个可以独立完成的子任务时，使用此工具将其分配给最合适的 subagent 类型。

可用的 subagent 类型：
- researcher: 深度研究员 — 通过网络搜索、网页抓取进行多角度信息收集与整理
- extractor: 数据提取器 — 从网页内容或文本中提取结构化信息
- summarizer: 文本摘要器 — 对长文本进行总结、归纳和综合
- browser: 浏览器自动化 — 打开网页、点击按钮、填写表单、提取页面内容

使用方式：
1. 确定子任务类型（researcher / extractor / summarizer / browser）
2. 编写清晰的 prompt 说明要完成什么
3. 可选提供 context 作为额外背景信息
4. 等待 subagent 返回结果后整合到最终回答中

如果需要多个子任务并行执行，可以一次性调用多个 task 工具。`,
  inputSchema: z.object({
    type: z
      .enum(["researcher", "extractor", "summarizer", "browser"])
      .describe("要创建的 subagent 类型"),
    prompt: z.string().min(1).describe("要执行的子任务的详细描述"),
    context: z.string().optional().describe("可选的额外背景信息，帮助 subagent 理解上下文"),
  }),
  execute: async (inputData, ctx): Promise<TaskToolResult> => {
    const { type, prompt, context } = inputData as {
      type: SubagentType;
      prompt: string;
      context?: string;
    };
    const requestContext = (ctx as ToolExecutionContext).requestContext;
    const startTime = performance.now();

    const template = subagentRegistry[type];
    if (!template) {
      throw new Error(`未知的 subagent 类型: ${type}`);
    }

    const fullPrompt = context ? `[上下文]\n${context}\n\n[任务]\n${prompt}` : prompt;

    // 模型由 resolveChatModel 统一解析
    const taskId = `task-${++taskCounter}-${Date.now()}`;
    const browser = template.getBrowser?.();
    const subagent = new Agent({
      id: taskId,
      name: template.name,
      instructions: template.getInstructions(),
      model: async () => resolveChatModel(requestContext),
      ...(browser ? { browser } : {}),
      tools: template.getTools(),
    });

    const result = await subagent.generate(fullPrompt, {
      ...(template.maxSteps !== undefined ? { maxSteps: template.maxSteps } : {}),
      ...(requestContext !== undefined ? { requestContext } : {}),
    });

    const duration = Math.round(performance.now() - startTime);

    const usage = result.usage
      ? {
          inputTokens: (result.usage as { inputTokens?: number }).inputTokens ?? 0,
          outputTokens: (result.usage as { outputTokens?: number }).outputTokens ?? 0,
          totalTokens: (result.usage as { totalTokens?: number }).totalTokens ?? 0,
        }
      : undefined;

    // 提取 subagent 内部产生的子工具调用结果
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawToolResults = (result as any).toolResults as
      | Array<{
          payload?: {
            toolName: string;
            toolCallId?: string;
            args?: unknown;
            result?: unknown;
            isError?: boolean;
          };
          toolName?: string;
          toolCallId?: string;
          args?: unknown;
          result?: unknown;
          isError?: boolean;
        }>
      | undefined;

    const childTools: SubagentChildToolCall[] | undefined = rawToolResults?.length
      ? rawToolResults.map((tr) => {
          const p = tr.payload ?? tr;
          return {
            toolName: String(p.toolName ?? "unknown"),
            toolCallId: p.toolCallId,
            args: p.args,
            result: p.result,
            isError: p.isError,
          };
        })
      : undefined;

    return {
      taskId,
      type,
      prompt,
      context,
      result: result.text,
      duration,
      childTools,
      usage,
    };
  },
});
