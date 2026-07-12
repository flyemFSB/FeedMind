/**
 * MessageParts — 将 UIMessage.parts 渲染为研究工作台组件
 *
 * 依照 AI SDK v6 消息协议分派每种 part 类型：
 * - text          → MessageResponse (Markdown 流式渲染)
 * - reasoning     → 合并为单个 Reasoning (可折叠思考过程)
 * - tool-{name}   → Tool (Collapsible 结构)
 * - source-*      → Sources (聚合展示)
 *
 * 设计目标：
 * - 可验证证据：回答后紧跟 Sources 折叠区
 * - 可理解执行过程：工具事件默认折叠，只显示状态摘要
 * - 克制的推理：不把原始思维链当作主内容
 */
"use client";

import { useMemo } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPartState,
} from "@/components/ai-elements/tool";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import { useChatContext } from "@/lib/chat/chat-context";
import { Copy, RotateCcw, User } from "lucide-react";
import type { UIMessage } from "ai";
import { useTranslation } from "react-i18next";

interface MessagePartsProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}

/** 提取用户消息纯文本 */
function userText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 提取工具和推理相关的 parts */
function useAgentParts(message: UIMessage, isLastMessage: boolean, isStreaming: boolean) {
  return useMemo(() => {
    const reasoningParts = message.parts.filter(
      (p): p is { type: "reasoning"; text: string } => p.type === "reasoning",
    );
    const consolidatedReasoning = reasoningParts.map((p) => p.text).join("\n\n");

    const lastPart = message.parts.at(-1);
    const isReasoningStreaming = isLastMessage && isStreaming && lastPart?.type === "reasoning";

    const stepCount = message.parts.filter((p) => p.type === "step-start").length;

    const toolParts: Array<{
      part: UIMessage["parts"][number];
      type: string;
      state: string;
      input: unknown;
      output: unknown;
      errorText?: string;
    }> = [];
    const sourceParts: Array<{ url?: string; title?: string }> = [];

    for (const part of message.parts) {
      const pType = part.type;

      if (typeof pType === "string" && pType.startsWith("tool-")) {
        const p = part as Record<string, unknown>;
        toolParts.push({
          part,
          type: pType,
          state: (p.state as string) ?? "input-streaming",
          input: p.input,
          output: "output" in p ? p.output : undefined,
          errorText: "errorText" in p ? (p.errorText as string) : undefined,
        });
        continue;
      }

      if (pType === "source-url" || pType === "source-document") {
        const src = part as { url?: string; title?: string };
        if (src.url || src.title) {
          sourceParts.push(src);
        }
      }
    }

    return { consolidatedReasoning, isReasoningStreaming, stepCount, toolParts, sourceParts };
  }, [message.parts, isLastMessage, isStreaming]);
}

export function MessageParts({ message, isLastMessage, isStreaming }: MessagePartsProps) {
  const { t } = useTranslation();
  const { regenerate } = useChatContext();
  const { consolidatedReasoning, isReasoningStreaming, stepCount, toolParts, sourceParts } =
    useAgentParts(message, isLastMessage, isStreaming);

  const hasReasoning = consolidatedReasoning.length > 0;
  const hasTools = toolParts.length > 0;
  const hasSources = sourceParts.length > 0;
  const hasSteps = stepCount > 0;

  /* ---- 用户消息 ---- */
  if (message.role === "user") {
    return (
      <Message from="user">
        <div className="flex flex-row-reverse items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-editorial-primary">
            <User size={12} className="text-editorial-ink-on-primary" />
          </div>
          <MessageContent>
            <div className="rounded-lg bg-editorial-surface-soft px-4 py-3 text-[13px] leading-relaxed text-editorial-ink">
              {userText(message)}
            </div>
          </MessageContent>
        </div>
      </Message>
    );
  }

  /* ---- 助手消息 ---- */
  return (
    <Message from="assistant">
      <div className="flex items-start gap-3">
        {/* Avatar — 纯色 Logo 背景 */}
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-editorial-ink">
          <img
            src="/FeedMind-logo.svg"
            alt="FeedMind Agent"
            width={24}
            height={24}
            className="size-6 rounded-full object-cover"
          />
        </div>

        {/* Body — 最大宽度 70ch 便于长篇阅读 */}
        <div className="min-w-0 flex-1 max-w-[70ch]">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[12px] font-semibold text-editorial-ink">FeedMind Agent</span>
          </div>

          <MessageContent>
            {/* ---- 步骤进度 ---- */}
            {hasSteps && (
              <div className="mb-2 text-[12px] text-editorial-ink-muted font-medium tracking-wide">
                {t("chat.thinkProcess")} · {stepCount + 1} 步
              </div>
            )}

            {/* ---- 执行过程（工具调用） ---- */}
            {hasTools && (
              <div className="space-y-1 mb-3">
                {toolParts.map((tp, i) => (
                  <Tool key={`tool-${i}`} defaultOpen={true}>
                    <ToolHeader
                      type={tp.type as `tool-${string}` | "dynamic-tool"}
                      state={tp.state as ToolPartState}
                    />
                    <ToolContent>
                      <ToolInput input={tp.input} />
                      {tp.state === "output-error" ? (
                        <ToolOutput errorText={tp.errorText ?? ""} />
                      ) : (
                        <ToolOutput output={formatOutput(tp.output)} />
                      )}
                    </ToolContent>
                  </Tool>
                ))}
              </div>
            )}

            {/* ---- 思考过程（可折叠，默认收起） ---- */}
            {hasReasoning && (
              <div className="mb-3">
                <Reasoning isStreaming={isReasoningStreaming} defaultOpen={false}>
                  <ReasoningTrigger />
                  <ReasoningContent>{consolidatedReasoning}</ReasoningContent>
                </Reasoning>
              </div>
            )}

            {/* ---- 展示内容（文本） ---- */}
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <MessageResponse key={`${message.id}-${i}`}>
                    {(part as { text: string }).text}
                  </MessageResponse>
                );
              }
              return null;
            })}

            {/* ---- 来源引用（可折叠） ---- */}
            {hasSources && (
              <div className="mt-3">
                <Sources defaultOpen={false}>
                  <SourcesTrigger count={sourceParts.length} />
                  {sourceParts.map((src, i) => (
                    <SourcesContent key={`src-${i}`}>
                      <Source href={src.url ?? "#"} title={src.title} />
                    </SourcesContent>
                  ))}
                </Sources>
              </div>
            )}
          </MessageContent>

          {/* Actions bar — 键盘聚焦也可见 */}
          {isLastMessage && (
            <MessageActions>
              <MessageAction
                onClick={() => {
                  const text = message.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p as { text: string }).text)
                    .join("");
                  navigator.clipboard.writeText(text).catch(() => {
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    ta.style.position = "fixed";
                    ta.style.opacity = "0";
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                  });
                }}
                label={t("common.copy")}
              >
                <Copy size={14} />
              </MessageAction>
              <MessageAction onClick={() => regenerate()} label={t("common.regenerate")}>
                <RotateCcw size={14} />
              </MessageAction>
            </MessageActions>
          )}
        </div>
      </div>
    </Message>
  );
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

/** 从工具输出提取人类可读摘要 */
function summarizeOutput(data: unknown): string {
  if (!data || typeof data !== "object") return String(data ?? "");

  const d = data as Record<string, unknown>;

  // 搜索结果：显示数量
  if (Array.isArray(d.results) || Array.isArray(d.items)) {
    const items = (d.results ?? d.items ?? []) as unknown[];
    return `已检索 ${items.length} 个结果`;
  }
  if (Array.isArray(data)) {
    return `共 ${data.length} 条记录`;
  }

  // 页面内容：显示标题和摘要
  if (d.title && typeof d.title === "string") {
    const snippet = d.snippet ?? d.description ?? d.content ?? "";
    const snippetStr = typeof snippet === "string" ? snippet.slice(0, 120) : "";
    return `📄 ${d.title}${snippetStr ? ": " + snippetStr : ""}`;
  }
  if (d.url && typeof d.url === "string") {
    return `🔗 ${d.url}`;
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
