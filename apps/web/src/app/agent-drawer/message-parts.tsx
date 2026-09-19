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
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai-elements/tool";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai-elements/chain-of-thought";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useChatContext } from "@/app/agent-drawer/chat-context";
import { cn } from "@/lib/utils";
import { Bot, Copy, ExternalLink, FileText, Loader2, RotateCcw, Wrench } from "lucide-react";
import type { UIMessage, FileUIPart } from "ai";
import { useTranslation } from "react-i18next";
import {
  useSubagentInspector,
  type SubagentTaskData,
} from "@/app/agent-drawer/subagent-inspector-context";

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
  const { regenerate, sendMessage } = useChatContext();
  const chainSteps = useChainSteps(message, isLastMessage, isStreaming);
  const stepCount = message.parts.filter((p) => p.type === "step-start").length;

  // 流式开始时自动展开思考链，让用户实时看到当前思考步骤（含 shimmer）。
  // render 期 prev 比较模式（React 官方 adjust-state-on-prop-change）：仅 isStreaming 上升沿
  // 触发；用户手动折叠后不会被重新打开。挂载即流式的极边缘场景首帧为折叠态
  const [chainOpen, setChainOpen] = useState(false);
  const [prevStreaming, setPrevStreaming] = useState(isStreaming);
  if (isStreaming !== prevStreaming) {
    setPrevStreaming(isStreaming);
    if (isStreaming) {
      setChainOpen(true);
    } else {
      // 回答完成时自动收起思考过程，聚焦正文内容
      setChainOpen(false);
    }
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
    const fileParts = message.parts.filter(
      (p): p is FileUIPart & { id?: string } => p.type === "file",
    );
    const text = userText(message);

    return (
      <Message from="user">
        <MessageContent>
          {fileParts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {fileParts.map((file) => {
                const isImg =
                  file.mediaType?.startsWith("image/") ||
                  /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i.test(file.filename ?? "");
                const name = file.filename || "图片";
                const fileKey = file.id || file.url || `${name}:${file.mediaType ?? ""}`;

                if (isImg && file.url) {
                  return (
                    <div
                      key={fileKey}
                      className="size-20 overflow-hidden rounded-lg border border-editorial-hairline shadow-2xs"
                    >
                      <img src={file.url} alt={name} className="size-full object-cover" />
                    </div>
                  );
                }

                return (
                  <div
                    key={fileKey}
                    className="flex items-center gap-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft px-2 py-1 text-xs text-editorial-ink"
                  >
                    <FileText size={13} className="text-editorial-primary shrink-0" />
                    <span className="max-w-[140px] truncate font-medium">{name}</span>
                  </div>
                );
              })}
            </div>
          )}
          {text}
        </MessageContent>
      </Message>
    );
  }

  /* ---- 推荐后续追问建议 ---- */
  const followUpSuggestions = [
    t("chat.followUpSummary", "总结核心要点"),
    t("chat.followUpConcept", "提炼知识概念"),
  ];

  /* ---- 助手消息 ---- */
  return (
    <div className="group relative flex w-full flex-col">
      <Message from="assistant">
        <MessageContent>
          {/* ---- 思考链：reasoning + tool 按执行顺序交织 ---- */}
          {chainSteps.length > 0 && (
            <div className="mb-2.5">
              <ChainOfThought open={chainOpen} onOpenChange={setChainOpen} defaultOpen={false}>
                <ChainOfThoughtHeader>
                  {t("chat.thinkProcess")}
                  {stepCount > 0 ? ` · ${stepCount + 1} 步` : ""}
                </ChainOfThoughtHeader>
                <ChainOfThoughtContent className="space-y-2">
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

      {/* 回答完毕的操作栏：位于回答内容的正下方 */}
      {!isStreaming && (
        <div className="mt-1.5 flex items-center gap-1">
          <MessageActions>
            <MessageAction
              onClick={() => {
                const text = message.parts
                  .flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []))
                  .join("");
                void navigator.clipboard.writeText(text);
              }}
              label={t("common.copy")}
              title={t("common.copy")}
            >
              <Copy size={13} />
            </MessageAction>
            {isLastMessage && (
              <MessageAction
                onClick={() => void regenerate()}
                label={t("common.regenerate")}
                title={t("common.regenerate")}
              >
                <RotateCcw size={13} />
              </MessageAction>
            )}
          </MessageActions>
        </div>
      )}

      {/* 后续追问建议：排布在操作栏下方 */}
      {isLastMessage && !isStreaming && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Suggestions layout="scroll">
            {followUpSuggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={() => void sendMessage({ text: suggestion })}
                className="text-[11px] py-0.5 px-2.5"
              >
                {suggestion}
              </Suggestion>
            ))}
          </Suggestions>
        </div>
      )}
    </div>
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
 * 采用官方标准 Reasoning 规范，包含思考中动效与完成耗时展示
 */
function ReasoningChainStep({ text, isActive }: { text: string; isActive: boolean }) {
  return (
    <Reasoning isStreaming={isActive} defaultOpen={isActive} className="w-full">
      <ReasoningTrigger />
      <ReasoningContent>
        {isActive ? (
          <Shimmer duration={1}>{text}</Shimmer>
        ) : (
          <MessageResponse>{text}</MessageResponse>
        )}
      </ReasoningContent>
    </Reasoning>
  );
}

/**
 * 思考链中的工具调用步骤：
 * 采用官方标准 Tool 规范，微边框紧凑胶囊卡片，节省横向空间
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
  const isTaskTool = toolName === "task";

  const subagentType =
    isTaskTool && typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)["type"]
      : undefined;

  const displayTitle = isTaskTool
    ? subagentType
      ? `Subagent (${String(subagentType)})`
      : "Subagent 任务"
    : toolName;

  const state: ToolState = isActive ? "running" : isError ? "output-error" : "output-available";

  return (
    <Tool toolName={toolName} state={state} className="w-full">
      <ToolHeader
        title={displayTitle}
        icon={
          isTaskTool ? (
            <Bot
              className={cn(
                "size-3.5",
                isActive ? "text-editorial-accent" : "text-editorial-ink-muted",
              )}
            />
          ) : (
            <Wrench
              className={cn(
                "size-3.5",
                isActive ? "text-editorial-accent" : "text-editorial-ink-muted",
              )}
            />
          )
        }
      />
      <ToolContent>
        {input !== undefined && input !== null && <ToolInput input={input} />}
        <ToolOutput isError={isError} errorText={errorText}>
          {isActive && output === undefined ? (
            <div className="flex items-center gap-1.5 rounded border border-editorial-hairline bg-editorial-surface-card/60 p-2 text-editorial-ink-muted italic font-mono text-[11px]">
              <Loader2 size={12} className="animate-spin text-editorial-accent" />
              <span>正在执行中，等待结果返回...</span>
            </div>
          ) : (
            <OutputVisual
              toolName={toolName}
              input={input}
              output={output}
              outputText={outputText}
            />
          )}
        </ToolOutput>
      </ToolContent>
    </Tool>
  );
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
