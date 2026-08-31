/**
 * MessageParts — 将 UIMessage.parts 渲染为研究工作台组件
 *
 * 依照 AI SDK v6 消息协议分派每种 part 类型：
 * - reasoning / tool-{name} → ChainOfThought 按实际执行顺序交替渲染（思考链）
 * - text                    → MessageResponse (Markdown 流式渲染)
 * - source-*                → Sources (聚合展示)
 *
 * 设计目标：
 * - 可验证证据：回答后紧跟 Sources 折叠区
 * - 可理解执行过程：思考与工具调用按真实运行顺序交织成可折叠思考链，而非分区展示
 * - 克制的推理：不把原始思维链当作主内容
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai-elements/chain-of-thought";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useChatContext } from "@/lib/chat/chat-context";
import { cn } from "@/lib/utils";
import {
  Bot,
  Brain,
  CheckCircle,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  RotateCcw,
  Wrench,
  XCircle,
} from "lucide-react";
import type { UIMessage } from "ai";
import { useTranslation } from "react-i18next";
import { useSubagentInspector, type SubagentTaskData } from "@/lib/chat/subagent-inspector-context";

interface MessagePartsProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}

function userText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 从 UIMessage part 中安全提取字段 */
function partField(part: UIMessage["parts"][number], key: string): unknown {
  return (part as Record<string, unknown>)[key];
}

type ChainStep =
  | { kind: "reasoning"; key: string; text: string; isActive: boolean }
  | {
      kind: "tool";
      key: string;
      toolName: string;
      isError: boolean;
      errorText: string;
      outputText: string;
      input: unknown;
      output: unknown;
      isActive: boolean;
    };

/** 工具是否失败：state 出错，或输出为含 error 字段的对象（Mastra 常把错误塞进 output） */
function isToolError(state: string | undefined, output: unknown): boolean {
  if (state === "output-error" || state === "output-denied") return true;
  const obj =
    typeof output === "string"
      ? (() => {
          try {
            return JSON.parse(output);
          } catch {
            return null;
          }
        })()
      : output;
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as Record<string, unknown>)["error"] === "string"
  );
}

function extractErrorText(output: unknown): string {
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output) as { error?: unknown; message?: unknown };
      return typeof parsed.error === "string"
        ? String(parsed.error)
        : typeof parsed.message === "string"
          ? String(parsed.message)
          : "";
    } catch {
      return "";
    }
  }
  if (typeof output === "object" && output !== null) {
    const d = output as Record<string, unknown>;
    return typeof d["error"] === "string"
      ? (d["error"] as string)
      : typeof d["message"] === "string"
        ? (d["message"] as string)
        : "";
  }
  return "";
}

/** 按 parts 执行顺序派生思考链：reasoning 与 tool-* 交替成步骤 */
function useChainSteps(
  message: UIMessage,
  isLastMessage: boolean,
  isStreaming: boolean,
): ChainStep[] {
  return useMemo(() => {
    // 流式中若最后一个 part 是 reasoning/tool，则该 step 标记为 active
    const lastPart = message.parts.at(-1);
    const streamingChainPart =
      isLastMessage &&
      isStreaming &&
      (lastPart?.type === "reasoning" ||
        (typeof lastPart?.type === "string" && lastPart.type.startsWith("tool-")))
        ? lastPart
        : undefined;

    const steps: ChainStep[] = [];

    for (const part of message.parts) {
      const isActive = part === streamingChainPart;

      // 思考片段
      if (part.type === "reasoning") {
        const text = (part as { text: string }).text;
        if (!text) continue;
        steps.push({ kind: "reasoning", key: `reasoning-${steps.length}`, text, isActive });
        continue;
      }

      // 工具调用（tool-{name} 嵌入在 type 里）
      if (typeof part.type === "string" && part.type.startsWith("tool-")) {
        const toolName = part.type.slice("tool-".length);
        const state = partField(part, "state") as string | undefined;
        const input = partField(part, "input");
        const output = partField(part, "output");
        const errorText = (partField(part, "errorText") as string | undefined) ?? "";
        const isError = isToolError(state, output);

        steps.push({
          kind: "tool",
          key: `tool-${toolName}-${steps.length}`,
          toolName,
          isError,
          errorText: errorText || (isError ? extractErrorText(output) : ""),
          outputText: formatOutput(output),
          input,
          output,
          isActive,
        });
      }
    }

    return steps;
  }, [message.parts, isLastMessage, isStreaming]);
}

// 流式 markdown 的解析（unified 管道）代价与文本总长成正比，
// 每个 token 都重解析会让长回答的 CPU 随文本增长持续走高（O(n²)）。
// 流式中把提交给 Streamdown 的文本节流到固定间隔，间隔内仅累积文本；
// 结束流式时立即提交最终文本，保证内容不丢。
const STREAM_THROTTLE_MS = 100;

function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const [throttled, setThrottled] = useState(text);
  const lastCommitRef = useRef(0);

  useEffect(() => {
    if (!streaming) {
      setThrottled(text);
      return;
    }
    const now = performance.now();
    if (now - lastCommitRef.current >= STREAM_THROTTLE_MS) {
      lastCommitRef.current = now;
      setThrottled(text);
      return;
    }
    const timer = setTimeout(
      () => {
        lastCommitRef.current = performance.now();
        setThrottled(text);
      },
      STREAM_THROTTLE_MS - (now - lastCommitRef.current),
    );
    return () => clearTimeout(timer);
  }, [text, streaming]);

  return <MessageResponse isAnimating={streaming}>{throttled}</MessageResponse>;
}

export function MessageParts({ message, isLastMessage, isStreaming }: MessagePartsProps) {
  const { t } = useTranslation();
  const { regenerate } = useChatContext();
  const chainSteps = useChainSteps(message, isLastMessage, isStreaming);
  const stepCount = message.parts.filter((p) => p.type === "step-start").length;

  // 流式开始时自动展开思考链，让用户实时看到当前思考步骤（含 shimmer）。
  // render 期 prev 比较模式（React 官方 adjust-state-on-prop-change）：仅 isStreaming 上升沿
  // 触发；用户手动折叠后不会被重新打开。挂载即流式的极边缘场景首帧为折叠态
  const [chainOpen, setChainOpen] = useState(false);
  const [prevStreaming, setPrevStreaming] = useState(isStreaming);
  if (isStreaming !== prevStreaming) {
    setPrevStreaming(isStreaming);
    if (isStreaming) setChainOpen(true);
  }

  const sourceParts: Array<{ url?: string | undefined; title?: string | undefined }> = [];
  for (const part of message.parts) {
    if (part.type === "source-url" || part.type === "source-document") {
      const url = partField(part, "url") as string | undefined;
      const title = partField(part, "title") as string | undefined;
      if (url || title) {
        sourceParts.push({ url, title });
      }
    }
  }
  const hasSources = sourceParts.length > 0;
  const lastTextPartIndex = message.parts.reduce(
    (lastIndex, part, index) => (part.type === "text" ? index : lastIndex),
    -1,
  );

  /* ---- 用户消息 ---- */
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent>{userText(message)}</MessageContent>
      </Message>
    );
  }

  /* ---- 助手消息 ---- */
  return (
    <>
      <Message from="assistant">
        <MessageContent>
          {/* ---- 思考链：reasoning + tool 按执行顺序交织（可折叠，自定义部分为例外） ---- */}
          {chainSteps.length > 0 && (
            <div className="mb-3">
              <ChainOfThought open={chainOpen} onOpenChange={setChainOpen} defaultOpen={false}>
                <ChainOfThoughtHeader>
                  {t("chat.thinkProcess")}
                  {stepCount > 0 ? ` · ${stepCount + 1} 步` : ""}
                </ChainOfThoughtHeader>
                <ChainOfThoughtContent>
                  {chainSteps.map((step) =>
                    step.kind === "reasoning" ? (
                      <ReasoningChainStep
                        key={step.key}
                        text={step.text}
                        isActive={step.isActive}
                      />
                    ) : (
                      <ToolChainStep
                        key={step.key}
                        toolName={step.toolName}
                        isError={step.isError}
                        errorText={step.errorText}
                        outputText={step.outputText}
                        input={step.input}
                        output={step.output}
                        isActive={step.isActive}
                      />
                    ),
                  )}
                </ChainOfThoughtContent>
              </ChainOfThought>
            </div>
          )}

          {/* ---- 展示内容（文本） ---- */}
          {message.parts.map((part, i) => {
            if (part.type !== "text") return null;
            return (
              <StreamingText
                key={`${message.id}-${i}`}
                text={(part as { text: string }).text}
                streaming={isLastMessage && isStreaming && i === lastTextPartIndex}
              />
            );
          })}

          {/* ---- 来源引用（可折叠） ---- */}
          {hasSources && (
            <Sources>
              <SourcesTrigger count={sourceParts.length}>
                {t("chat.sourcesCount", { count: sourceParts.length })}
              </SourcesTrigger>
              {sourceParts.map((src) => (
                <SourcesContent key={`${src.url ?? ""}#${src.title ?? ""}`}>
                  <Source href={src.url ?? "#"} title={src.title} />
                </SourcesContent>
              ))}
            </Sources>
          )}
        </MessageContent>
      </Message>

      {/* Actions bar — 官方示例中 MessageActions 与 Message 同级 */}
      {isLastMessage && (
        <MessageActions>
          <MessageAction
            onClick={() => {
              const text = message.parts
                .flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []))
                .join("");
              void navigator.clipboard.writeText(text);
            }}
            label={t("common.copy")}
          >
            <Copy size={14} />
          </MessageAction>
          <MessageAction onClick={() => void regenerate()} label={t("common.regenerate")}>
            <RotateCcw size={14} />
          </MessageAction>
        </MessageActions>
      )}
    </>
  );
}

interface ToolChainStepProps {
  toolName: string;
  isError: boolean;
  errorText: string;
  outputText: string;
  input: unknown;
  output: unknown;
  isActive: boolean;
}

/**
 * 思考链中的 reasoning 步骤：
 * - 无"思考"标签，直接展示思考内容（流式时 shimmer 标记当前思考步骤）
 */
function ReasoningChainStep({ text, isActive }: { text: string; isActive: boolean }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-5">
      {/* 时间线图标列 */}
      <div className="relative flex h-5 shrink-0 items-center">
        <Brain className={cn("size-4", isActive ? "text-foreground" : "text-muted-foreground")} />
        <div className="absolute top-5 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      </div>
      {/* 思考内容直接展示；流式中用 Shimmer 高亮 */}
      <div className="min-w-0 flex-1">
        {isActive ? (
          <Shimmer duration={1}>{text}</Shimmer>
        ) : (
          <MessageResponse>{text}</MessageResponse>
        )}
      </div>
    </div>
  );
}

/**
 * 思考链中的工具调用步骤：
 * - 独立可展开/收起（base-ui Collapsible），默认收起
 * - 状态用图标而非文字标记：流式转圈 / 成功绿勾 / 失败红叉
 * - 展开后高交互展示输入输出（支持一键唤起独立 Subagent 观测抽屉）
 */
function ToolChainStep({
  toolName,
  isError,
  errorText,
  outputText,
  input,
  output,
  isActive,
}: ToolChainStepProps) {
  // 无内容时（流式尚未产出）不渲染折叠触发器
  const hasContent = Boolean(input !== undefined || output !== undefined);
  const isTaskTool = toolName === "task";

  // 提取 Subagent 类型用于标签展示
  const subagentType =
    isTaskTool && typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)["type"]
      : undefined;

  const displayTitle = isTaskTool
    ? subagentType
      ? `Subagent (${String(subagentType)})`
      : "Subagent 任务"
    : toolName;

  return (
    <Collapsible className="flex items-start gap-2 text-sm">
      {/* 时间线图标列：h-5 与 text-sm 行高一致，保证图标垂直居中于首行；线从图标正下方开始 */}
      <div className="relative flex h-5 shrink-0 items-center">
        {isTaskTool ? (
          <Bot
            className={cn("size-4", isActive ? "text-editorial-accent" : "text-muted-foreground")}
          />
        ) : (
          <Wrench
            className={cn("size-4", isActive ? "text-foreground" : "text-muted-foreground")}
          />
        )}
        <div className="absolute top-5 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <CollapsibleTrigger className="flex w-full items-center gap-2 text-left leading-5 hover:text-foreground">
          <span className={cn("font-medium", isTaskTool && "text-editorial-ink font-semibold")}>
            {displayTitle}
          </span>
          {isActive ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : isError ? (
            <XCircle size={14} className="text-red-500" />
          ) : (
            <CheckCircle size={14} className="text-green-600" />
          )}
          {hasContent && (
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform data-[panel-open]:rotate-180" />
          )}
        </CollapsibleTrigger>
        {hasContent && (
          <CollapsibleContent>
            <ToolDetail
              toolName={toolName}
              input={input}
              output={output}
              outputText={outputText}
              errorText={errorText}
              isError={isError}
              isActive={isActive}
            />
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

/** 展开后的工具详情：仅"输入 + 输出"两区，可视化呈现（无复制） */
function ToolDetail({
  toolName,
  input,
  output,
  outputText,
  errorText,
  isError,
  isActive,
}: {
  toolName: string;
  input: unknown;
  output: unknown;
  outputText: string;
  errorText: string;
  isError: boolean;
  isActive: boolean;
}) {
  return (
    <div className="space-y-2 text-xs leading-5">
      {/* 输入 */}
      <div>
        <div className="mb-1 font-medium text-muted-foreground">输入</div>
        <InputVisual input={input} />
      </div>

      {/* 输出 / 错误 */}
      <div>
        <div className={cn("mb-1 font-medium", isError ? "text-red-600" : "text-muted-foreground")}>
          {isError ? "错误" : "输出"}
        </div>
        {isError ? (
          <div className="rounded-md border border-red-600/20 bg-red-600/5 px-2.5 py-2 text-red-600">
            {errorText || outputText || "工具调用失败"}
          </div>
        ) : isActive && output === undefined ? (
          <div className="flex items-center gap-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft/30 px-2.5 py-2 text-editorial-ink-muted italic">
            <Loader2 size={13} className="animate-spin text-editorial-accent" />
            <span>正在执行中，等待结果返回...</span>
          </div>
        ) : (
          <OutputVisual toolName={toolName} input={input} output={output} outputText={outputText} />
        )}
      </div>
    </div>
  );
}

/** 输入参数：结构化展示（长文本带高度限制与滚动） */
function InputVisual({ input }: { input: unknown }) {
  if (input === undefined || input === null) return null;
  if (typeof input === "object" && !Array.isArray(input)) {
    const entries = Object.entries(input);
    if (entries.length === 0) return null;
    return (
      <div className="space-y-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft/40 p-2.5">
        {entries.map(([k, v]) => {
          const isLongText = typeof v === "string" && v.length > 80;
          return (
            <div key={k} className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium text-muted-foreground">{k}:</span>
              <div
                className={cn(
                  "min-w-0 text-foreground break-words rounded bg-editorial-surface-card/70 p-1.5 border border-editorial-hairline/40 text-[11px] font-mono",
                  isLongText && "max-h-24 overflow-y-auto",
                )}
              >
                {typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <div className="text-foreground text-xs">{String(input)}</div>;
}

/** 工具输出可视化：Subagent 轨迹、搜索结果徽章、长文本片段及摘要 */
function OutputVisual({
  toolName,
  input,
  output,
  outputText,
}: {
  toolName: string;
  input: unknown;
  output: unknown;
  outputText: string;
}) {
  const { openInspector } = useSubagentInspector();

  const parsed: Record<string, unknown> | null =
    typeof output === "string"
      ? (() => {
          try {
            return JSON.parse(output) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : typeof output === "object" && output !== null
        ? (output as Record<string, unknown>)
        : null;

  // 子智能体（Subagent）专属执行轨迹分支
  const isTask =
    toolName === "task" ||
    (parsed &&
      (typeof parsed["result"] === "string" ||
        parsed["type"] === "researcher" ||
        parsed["type"] === "extractor" ||
        parsed["type"] === "summarizer" ||
        parsed["type"] === "browser"));

  if (isTask && parsed) {
    const subType = String(
      parsed["type"] ??
        (typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)["type"]
          : "subagent"),
    );
    const resultText = typeof parsed["result"] === "string" ? parsed["result"] : "";
    const duration = typeof parsed["duration"] === "number" ? parsed["duration"] : undefined;
    const childTools = Array.isArray(parsed["childTools"])
      ? (parsed["childTools"] as SubagentTaskData["childTools"])
      : undefined;
    const prompt = String(
      parsed["prompt"] ??
        (typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)["prompt"]
          : ""),
    );
    const context =
      typeof parsed["context"] === "string"
        ? parsed["context"]
        : typeof input === "object" && input !== null
          ? ((input as Record<string, unknown>)["context"] as string | undefined)
          : undefined;
    const usage = parsed["usage"] as SubagentTaskData["usage"] | undefined;

    const taskSnapshot: SubagentTaskData = {
      taskId: typeof parsed["taskId"] === "string" ? parsed["taskId"] : undefined,
      type: subType,
      prompt,
      context,
      result: resultText,
      duration,
      childTools,
      usage,
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot size={13} className="text-editorial-accent" />
            <span className="font-semibold text-editorial-ink capitalize">{subType} 执行完成</span>
            {duration !== undefined && (
              <span>
                · {duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`}
              </span>
            )}
            {childTools && childTools.length > 0 && <span>· {childTools.length} 次工具调用</span>}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openInspector(taskSnapshot);
            }}
            className="flex items-center gap-1 rounded bg-editorial-surface-soft px-2 py-0.5 text-[11px] font-medium text-editorial-accent hover:bg-editorial-surface-strong hover:text-editorial-ink transition-colors border border-editorial-hairline/80 shadow-2xs"
          >
            <span>查看完整轨迹</span>
            <ExternalLink size={11} />
          </button>
        </div>

        {resultText ? (
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-editorial-hairline bg-editorial-surface-soft/40 p-2.5 text-editorial-ink-soft leading-relaxed text-xs">
            {resultText.length > 300 ? resultText.slice(0, 300) + "…" : resultText}
          </div>
        ) : (
          <div className="text-editorial-ink-muted italic">（未返回文本结果）</div>
        )}
      </div>
    );
  }

  // 搜索结果列表渲染为来源域名徽章
  const results = parsed
    ? Array.isArray(parsed["results"])
      ? parsed["results"]
      : Array.isArray(parsed["items"])
        ? parsed["items"]
        : null
    : null;
  if (results) {
    return (
      <ChainOfThoughtSearchResults>
        {results.map((r) => {
          const item = (typeof r === "object" && r !== null ? r : {}) as {
            title?: string;
            url?: string;
          };
          const url = item.url;
          // 内容键：url/title 即条目身份；列表随消息只追加不重排，重复内容行本就可互换
          const itemKey = `${item.url ?? ""}#${item.title ?? ""}`;
          const badge = (
            <ChainOfThoughtSearchResult key={itemKey} title={item.title}>
              {url ? domainOf(url) : (item.title ?? "")}
            </ChainOfThoughtSearchResult>
          );
          // 点击域名徽章在新标签页打开来源
          return url ? (
            <a key={itemKey} href={url} target="_blank" rel="noreferrer" className="inline-flex">
              {badge}
            </a>
          ) : (
            badge
          );
        })}
      </ChainOfThoughtSearchResults>
    );
  }

  // 网页抓取与长文本输出做截断展示
  if (typeof output === "string" && output.length > 0) {
    return (
      <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-editorial-hairline bg-editorial-surface-soft/40 px-2.5 py-2 text-editorial-ink-soft">
        {output.length > 600 ? output.slice(0, 600) + "…" : output}
      </div>
    );
  }

  // 其余类型输出展示格式化摘要
  return <div className="text-editorial-ink-soft">{outputText || "（无输出）"}</div>;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 格式化工具输出：优先使用摘要，不展示原始大段 JSON */
function formatOutput(output: unknown): string {
  if (output === undefined || output === null) return "";
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      return summarizeOutput(parsed);
    } catch {
      return output.length > 200 ? output.slice(0, 200) + "…" : output;
    }
  }
  if (typeof output === "object") {
    return summarizeOutput(output);
  }
  return String(output);
}

function summarizeOutput(data: unknown): string {
  if (!data || typeof data !== "object") return String(data ?? "");

  const d = data as Record<string, unknown>;

  // 错误对象：展示错误信息
  if (typeof d["error"] === "string") {
    return `⚠️ ${d["error"]}`;
  }

  // Subagent 结果：展示完成摘要
  if (typeof d["result"] === "string") {
    const subType = d["type"] ? `[${String(d["type"])}] ` : "";
    const dur = typeof d["duration"] === "number" ? ` (${d["duration"]}ms)` : "";
    return `${subType}子任务执行完成${dur}`;
  }

  // 搜索结果：显示数量
  if (Array.isArray(d["results"]) || Array.isArray(d["items"])) {
    const items = (d["results"] ?? d["items"] ?? []) as unknown[];
    return `已检索 ${items.length} 个结果`;
  }
  if (Array.isArray(data)) {
    return `共 ${data.length} 条记录`;
  }

  // 页面内容：显示标题和摘要
  if (d["title"] && typeof d["title"] === "string") {
    const snippet = d["snippet"] ?? d["description"] ?? d["content"] ?? "";
    const snippetStr = typeof snippet === "string" ? snippet.slice(0, 120) : "";
    return `📄 ${d["title"]}${snippetStr ? ": " + snippetStr : ""}`;
  }
  if (d["url"] && typeof d["url"] === "string") {
    return `🔗 ${d["url"]}`;
  }

  // 一般对象：显示键摘要
  const keys = Object.keys(d);
  if (keys.length <= 3) {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  // 大对象：只显示结构信息
  return `${keys.length} 个字段`;
}
