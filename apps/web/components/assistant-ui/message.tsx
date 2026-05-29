"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { MessagePartState } from "@assistant-ui/core";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  RotateCcw,
  Undo2,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  AttachmentPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  ErrorPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "./markdown-text";
import { emitAgentRunning } from "@/lib/api/agent";

// 将 reasoning 和 tool-call 分配给"思考过程"分组，其余 parts 直接渲染
const groupThinkingParts = (part: MessagePartState) => {
  if (part.type === "reasoning") {
    return ["group-chainOfThought", "group-reasoning"] as const;
  }
  if (part.type === "tool-call") {
    return ["group-chainOfThought", "group-tool"] as const;
  }
  return null;
};

function formatToolPayload(value: unknown): string {
  if (value === undefined) return "";
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

function MessageAttachment() {
  return (
    <AttachmentPrimitive.Root className="inline-flex max-w-[240px] items-center gap-2 rounded-xl border border-[#d2d2d7] bg-[#f5f5f7] px-3 py-2 text-[12px] text-[#1d1d1f]">
      <FileText size={14} className="text-[#86868b] shrink-0" />
      <span className="truncate">
        <AttachmentPrimitive.Name />
      </span>
    </AttachmentPrimitive.Root>
  );
}

function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <ErrorPrimitive.Message />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

function MessageAttachments() {
  return (
    <MessagePrimitive.Attachments>
      {() => <MessageAttachment />}
    </MessagePrimitive.Attachments>
  );
}

function MessageBranchPicker({ align = "start" }: { align?: "start" | "end" }) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={`flex items-center gap-1 text-[11px] text-[#86868b] ${
        align === "end" ? "justify-end" : "justify-start"
      }`}
    >
      <BranchPickerPrimitive.Previous asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-md text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-40"
          title="上一分支"
        >
          <ChevronLeft size={13} strokeWidth={1.8} />
        </Button>
      </BranchPickerPrimitive.Previous>
      <span className="min-w-8 text-center tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-md text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-40"
          title="下一分支"
        >
          <ChevronRight size={13} strokeWidth={1.8} />
        </Button>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function UserMessage() {
  const createdAt = useAuiState((s) => s.message.createdAt);

  return (
    <MessagePrimitive.Root className="group/action-area flex gap-3 flex-row-reverse animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-[#0071e3] flex items-center justify-center shrink-0 mt-0.5">
        <User size={14} className="text-white" strokeWidth={2} />
      </div>
      <div className="flex flex-col items-end max-w-[85%]">
        <MessageAttachments />
        <div className="relative">
          <div className="px-4 py-3 rounded-2xl bg-[#e8e8ed] text-[#1d1d1f] rounded-tr-sm text-[14px] leading-relaxed selection:bg-[#0071e3] selection:text-white">
            <MessagePrimitive.Parts
              components={{ Text: ({ text }) => <span>{text}</span> }}
            />
          </div>
          <ActionBarPrimitive.Root
            hideWhenRunning
            autohide="never"
            className="absolute right-full top-1/2 -translate-y-1/2 pr-2
                       opacity-0 group-hover/action-area:opacity-100
                       transition-opacity duration-150"
          >
            <ActionBarPrimitive.Edit asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-7 w-7 rounded-lg text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
                title="修改"
              >
                <Undo2 size={14} strokeWidth={1.8} />
              </Button>
            </ActionBarPrimitive.Edit>
          </ActionBarPrimitive.Root>
        </div>
        <MessageError />
        <span className="text-[11px] text-[#86868b] mt-1.5 px-1">
          {createdAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <MessageBranchPicker align="end" />
      </div>
    </MessagePrimitive.Root>
  );
}

function UserEditComposer() {
  const aui = useAui();
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const composerText = useAuiState((s) => s.composer.text);
  const [value, setValue] = useState(composerText);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!isComposingRef.current) {
      setValue(composerText);
    }
  }, [composerText]);

  const syncText = (nextValue: string) => {
    aui.composer().setText(nextValue);
  };

  return (
    <ComposerPrimitive.Root className="flex gap-3 flex-row-reverse animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-[#0071e3] flex items-center justify-center shrink-0 mt-0.5">
        <User size={14} className="text-white" strokeWidth={2} />
      </div>
      <div className="flex w-full max-w-[85%] flex-col items-end gap-2">
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            if (!isComposingRef.current) {
              syncText(nextValue);
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false;
            const nextValue = event.currentTarget.value;
            setValue(nextValue);
            syncText(nextValue);
          }}
          className="min-h-[96px] w-full resize-none rounded-2xl rounded-tr-sm border border-[#0071e3] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,113,227,0.12)] outline-none placeholder:text-[#86868b]"
          placeholder="编辑你的消息"
        />
        <div className="flex items-center gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 rounded-lg bg-[#f5f5f7] px-3 text-[12px] text-[#1d1d1f] hover:bg-[#e8e8ed]"
              title="取消编辑"
            >
              <X size={14} strokeWidth={1.8} />
              <span>取消</span>
            </Button>
          </ComposerPrimitive.Cancel>
          <Button
            size="sm"
            className="h-8 rounded-lg bg-[#0071e3] px-3 text-[12px] text-white hover:bg-[#0077ed]"
            disabled={isEmpty}
            title="提交编辑"
            onClick={() => aui.composer().send({ startRun: true })}
          >
            <Check size={14} strokeWidth={1.8} />
            <span>提交</span>
          </Button>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function AssistantActionBar() {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="absolute left-0 top-0 flex items-center gap-0.5
                 opacity-0 group-hover/action-area:opacity-100
                 transition-opacity duration-150"
    >
      <ActionBarPrimitive.Copy asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="p-1.5 rounded-lg hover:bg-[#f5f5f7]
                     text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          title="复制"
          onClick={() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check size={15} className="text-green-500" />
          ) : (
            <Copy size={15} strokeWidth={1.8} />
          )}
        </Button>
      </ActionBarPrimitive.Copy>

      <ActionBarPrimitive.Reload asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="p-1.5 rounded-lg hover:bg-[#f5f5f7]
                     text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          title="重新生成"
        >
          <RotateCcw size={15} strokeWidth={1.8} />
        </Button>
      </ActionBarPrimitive.Reload>

      <div className="w-px h-3.5 bg-[#d2d2d7] mx-0.5" />

      <ActionBarPrimitive.FeedbackPositive asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={`p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors ${
            feedback === "up"
              ? "text-green-500"
              : "text-[#86868b] hover:text-[#1d1d1f]"
          }`}
          title="有帮助"
          onClick={() => setFeedback(feedback === "up" ? null : "up")}
        >
          <ThumbsUp size={15} strokeWidth={1.8} />
        </Button>
      </ActionBarPrimitive.FeedbackPositive>

      <ActionBarPrimitive.FeedbackNegative asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={`p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-colors ${
            feedback === "down"
              ? "text-red-400"
              : "text-[#86868b] hover:text-[#1d1d1f]"
          }`}
          title="没有帮助"
          onClick={() => setFeedback(feedback === "down" ? null : "down")}
        >
          <ThumbsDown size={15} strokeWidth={1.8} />
        </Button>
      </ActionBarPrimitive.FeedbackNegative>
    </ActionBarPrimitive.Root>
  );
}

function ThinkingAccordion({
  children,
  status,
}: {
  children: ReactNode;
  status?: MessagePartState["status"];
}) {
  const running = status?.type === "running";
  const [open, setOpen] = useState(false);
  const expanded = running || open;

  useEffect(() => {
    emitAgentRunning(running);
  }, [running]);

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center gap-2.5 border-b border-[#e5e5e5] px-4 text-left text-[13px] font-semibold text-[#111111] transition-colors hover:bg-[#fafafa]"
      >
        {expanded ? (
          <ChevronDown size={15} strokeWidth={2.2} />
        ) : (
          <ChevronRight size={15} strokeWidth={2.2} />
        )}
        <span>思考过程</span>
      </button>
      {expanded && <div className="space-y-2.5 px-4 py-3">{children}</div>}
    </div>
  );
}

function ReasoningGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

function ReasoningContent({ text }: { text: string }) {
  if (!text.trim()) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 text-[13px] leading-6 text-[#6e6e73]">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f1f1f1] text-[#8a8a8a]">
        <Brain size={11} strokeWidth={1.8} />
      </span>
      <div className="whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function ToolGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

type ToolFallbackProps = Extract<MessagePartState, { type: "tool-call" }>;

function ToolFallback(part: ToolFallbackProps) {
  const { args, argsText, isError, result, status, toolName } = part;
  const running = status?.type === "running";
  const StatusIcon = running ? Wrench : Check;
  const [open, setOpen] = useState(false);
  const formattedArgs = argsText || formatToolPayload(args);
  const formattedResult = formatToolPayload(result);
  const hasArgs = formattedArgs.trim() && formattedArgs.trim() !== "{}";
  const hasResult = formattedResult.trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[13px] font-semibold text-[#111111]">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#d9f7ee] text-[#00a979]">
          <StatusIcon size={10} strokeWidth={running ? 1.8 : 2} />
        </span>
        <span>{toolName}</span>
        <button
          type="button"
          className="ml-auto grid h-6 w-6 place-items-center rounded-md text-[#6e6e73] transition-colors hover:bg-[#f5f5f7] hover:text-[#111111]"
          title={open ? "收起工具调用详情" : "展开工具调用详情"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown size={14} strokeWidth={1.8} />
          ) : (
            <ChevronRight size={14} strokeWidth={1.8} />
          )}
        </button>
      </div>
      {open && (
        <div className="ml-7 space-y-2 rounded-lg bg-[#f7f7f8] px-3 py-2 text-[12px] leading-5 text-[#424245]">
          {hasArgs && (
            <div>
              <div className="mb-1 font-medium text-[#6e6e73]">参数</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
                {formattedArgs}
              </pre>
            </div>
          )}
          {hasResult && (
            <div>
              <div className={`mb-1 font-medium ${isError ? "text-red-500" : "text-[#6e6e73]"}`}>
                {isError ? "错误" : "结果"}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
                {formattedResult}
              </pre>
            </div>
          )}
          {!hasArgs && !hasResult && (
            <div className="text-[#86868b]">暂无参数或结果</div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantMessage() {
  const createdAt = useAuiState((s) => s.message.createdAt);

  return (
    <MessagePrimitive.Root className="flex gap-3 animate-fade-in group/action-area">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0071e3] to-[#2997ff] flex items-center justify-center shrink-0 mt-0.5">
        <Image
          src="/FeedMind-logo.png"
          alt="FeedMind Agent"
          width={28}
          height={28}
          className="h-7 w-7 rounded-full object-cover"
        />
      </div>

      <div className="flex-1 max-w-[85%] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1d1d1f]">FeedMind Agent</span>
          <span className="text-[11px] text-[#86868b]">
            {createdAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div className="text-[14px] text-[#1d1d1f] leading-relaxed">
          <MessageAttachments />
          <MessagePrimitive.GroupedParts
            groupBy={groupThinkingParts}
          >
            {({ part, children }) => {
              switch (part.type) {
                case "group-chainOfThought":
                  return <ThinkingAccordion status={part.status}>{children}</ThinkingAccordion>;
                case "group-tool":
                  return <ToolGroup>{children}</ToolGroup>;
                case "group-reasoning":
                  return <ReasoningGroup>{children}</ReasoningGroup>;
                case "text":
                  return <MarkdownText />;
                case "reasoning":
                  return <ReasoningContent text={part.text} />;
                case "tool-call":
                  return part.toolUI ?? <ToolFallback {...part} />;
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>
          <MessageError />
        </div>

        <div className="flex h-8 items-center gap-3">
          <div className="relative h-8 w-[128px]">
            <AssistantActionBar />
          </div>
          <MessageBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
export const messageComponents = {
  UserMessage,
  AssistantMessage,
  EditComposer: UserEditComposer,
};
