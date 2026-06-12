/**
 * MessageParts — 将 UIMessage.parts 渲染为可读的 Agent 思考过程
 *
 * 依照 AI SDK v6 消息协议分派每种 part 类型：
 * - text          → MessageResponse (Markdown 流式渲染)
 * - reasoning     → Reasoning (可折叠思考过程)
 * - tool-{name}   → Tool (调用状态 + 参数 + 结果)
 * - step-start    → 步骤分隔线
 * - source-*      → 来源引用
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
 * @see https://mastra.ai/reference/ai-sdk/chat-route
 */
"use client";

import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, type ToolStatus } from "@/components/ai-elements/tool";
import { useChatContext } from "@/lib/chat/chat-context";
import {
  Copy,
  RotateCcw,
  User,
  Link as LinkIcon,
  Brain,
  ChevronDown,
} from "lucide-react";
import type { UIMessage } from "ai";
import { useTranslation } from "react-i18next";

/* -------------------------------------------------------------------------- */
/* Types */
/* -------------------------------------------------------------------------- */
interface MessagePartsProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}

interface ToolPartInfo {
  toolName: string;
  status: ToolStatus;
  args: string;
  result: string;
  isError: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------------------------------- */

/** 格式化任意值为可读 JSON 字符串 */
function formatPayload(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 提取用户消息纯文本 */
function userText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * 解析 AI SDK v6 的 tool-{toolName} part。
 *
 * ToolUIPart 结构：
 *   type: `tool-${NAME}`
 *   state: "input-streaming" | "input-available" | "output-available" | "output-error"
 *   input: unknown   (工具参数)
 *   output: unknown  (工具结果，仅 output-available 时存在)
 *   errorText: string (仅 output-error 时存在)
 */
function parseToolPart(part: UIMessage["parts"][number]): ToolPartInfo | null {
  const type = part.type;
  if (typeof type !== "string" || !type.startsWith("tool-")) return null;

  const toolName = type.slice("tool-".length);
  const p = part as Record<string, unknown>;
  const state = p.state as string | undefined;
  const input = p.input;
  const output = "output" in p ? p.output : undefined;
  const errorText = "errorText" in p ? (p.errorText as string) : undefined;

  const status: ToolStatus =
    state === "output-available" ? "complete" :
    state === "output-error" ? "error" :
    state === "input-streaming" ? "streaming" :
    "running";

  return {
    toolName,
    status,
    args: input !== undefined ? formatPayload(input) : "",
    result: output !== undefined ? formatPayload(output) : errorText ?? "",
    isError: state === "output-error",
  };
}

/* -------------------------------------------------------------------------- */
/* ThinkingProcess — 全量思考过程折叠容器 */
/* -------------------------------------------------------------------------- */

/**
 * ThinkingProcess 包裹助手消息中的推理 + 工具调用，
 * 提供统一的展开/收起控制。
 *
 * - 流式进行中自动展开
 * - 完成后可手动折叠
 * - 无思考内容时完全隐藏
 */
function ThinkingProcess({
  isStreaming,
  children,
}: {
  isStreaming: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  // 流式时自动展开
  useEffect(() => {
    if (isStreaming) setIsOpen(true);
  }, [isStreaming]);

  return (
    <div className="overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] font-medium text-editorial-ink-soft hover:text-editorial-ink transition-colors",
          isOpen && "border-b border-editorial-hairline",
        )}
      >
        <motion.span
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.15 }}
          className="shrink-0"
        >
          <ChevronDown size={14} className="text-editorial-ink-muted" />
        </motion.span>

        <Brain size={14} className="shrink-0 text-editorial-ink-muted" />

        <span>{t("chat.thinkProcess")}</span>

        {/* Streaming indicator */}
        {isStreaming && (
          <span className="ml-auto inline-flex items-center gap-[2px]">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="inline-block h-1 w-1 rounded-full bg-editorial-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </span>
        )}
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="think-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MessageParts */
/* -------------------------------------------------------------------------- */
export function MessageParts({ message, isLastMessage, isStreaming }: MessagePartsProps) {
  const { t } = useTranslation();
  const { regenerate } = useChatContext();

  // 区分"思考"和"展示"内容
  const { thinkParts, displayParts } = useMemo(() => {
    const think: UIMessage["parts"] = [];
    const display: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type === "reasoning" || part.type === "step-start" || parseToolPart(part)) {
        think.push(part);
      } else {
        display.push(part);
      }
    }
    return { thinkParts: think, displayParts: display };
  }, [message.parts]);

  const hasThinking = thinkParts.length > 0;
  const isThinkingStreaming = isStreaming && thinkParts.some((p) => {
    if (p.type === "reasoning") return true;
    const t = parseToolPart(p);
    return t && (t.status === "streaming" || t.status === "running");
  });

  // 合并所有 reasoning part 的文本为一个可折叠面板
  const reasoningParts = message.parts.filter(
    (p): p is { type: "reasoning"; text: string } => p.type === "reasoning",
  );
  const reasoningText = reasoningParts.map((p) => p.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming = isLastMessage && isStreaming && lastPart?.type === "reasoning";

  /* ---- 用户消息 ---- */
  if (message.role === "user") {
    return (
      <Message from="user">
        <div className="flex flex-row-reverse items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-editorial-primary">
            <User size={14} className="text-editorial-ink-on-primary" />
          </div>
          <MessageContent>
            <div className="rounded-2xl rounded-tr-sm bg-editorial-surface-soft px-4 py-3 text-[14px] leading-relaxed text-editorial-ink">
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
        {/* Avatar */}
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-editorial-ink to-editorial-primary-active">
          <img
            src="/FeedMind-logo.svg"
            alt="FeedMind Agent"
            width={28}
            height={28}
            className="size-7 rounded-full object-cover"
          />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-editorial-ink">FeedMind Agent</span>
          </div>

          <MessageContent>
            {/* ---- 思考过程（推理 + 工具调用） ---- */}
            {hasThinking && (
              <ThinkingProcess isStreaming={isThinkingStreaming}>
                {/* 合并渲染所有推理文本 */}
                {hasReasoning && (
                  <Reasoning isStreaming={isReasoningStreaming} defaultOpen={isReasoningStreaming}>
                    <ReasoningTrigger />
                    <ReasoningContent>{reasoningText}</ReasoningContent>
                  </Reasoning>
                )}

                {thinkParts.map((part, i) => {
                  const toolInfo = parseToolPart(part);
                  if (toolInfo) {
                    return (
                      <Tool
                        key={`think-${i}`}
                        toolName={toolInfo.toolName}
                        status={toolInfo.status}
                        args={toolInfo.args}
                        result={toolInfo.result}
                        isError={toolInfo.isError}
                      />
                    );
                  }

                  switch (part.type) {
                    case "reasoning":
                      return null; // 已在上面合并渲染
                    case "step-start":
                      return null; // 已移除分割线
                    default:
                      return null;
                  }
                })}
              </ThinkingProcess>
            )}

            {/* ---- 展示内容（文本、来源引用等） ---- */}
            {displayParts.map((part, i) => {
              switch (part.type) {
                case "text":
                  return (
                    <MessageResponse key={`${message.id}-${i}`}>
                      {(part as { text: string }).text}
                    </MessageResponse>
                  );

                case "source-url":
                case "source-document": {
                  const src = part as { url?: string; title?: string };
                  return (
                    <div
                      key={`${message.id}-${i}`}
                      className="flex items-center gap-1.5 text-[12px] text-editorial-ink-muted"
                    >
                      <LinkIcon size={12} className="shrink-0" />
                      <span className="truncate">{src.title || src.url || t("chat.source")}</span>
                    </div>
                  );
                }

                default:
                  return null;
              }
            })}
          </MessageContent>

          {/* Actions bar */}
          {isLastMessage && (
            <MessageActions>
              <MessageAction
                onClick={() => {
                  const text = message.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p as { text: string }).text)
                    .join("");
                  navigator.clipboard.writeText(text).catch(() => {
                    /* fallback for older browsers */
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
