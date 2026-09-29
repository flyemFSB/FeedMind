/**
 * Composer — 消息输入组件
 * 使用官方 ai-elements PromptInput 组合：
 * PromptInput(InputGroup 单边框) → PromptInputTextarea + PromptInputFooter → PromptInputSubmit
 * 全部为 ai-elements 内置组件，无自定义嵌套框
 */

import { useEffect, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputAttachments,
  PromptInputAttachmentButton,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ChatModelSelector } from "@/components/ai-elements/model-selector";
import { useChatContext } from "@/app/agent-drawer/chat-context";
import { useAppShell } from "@/app/shell/app-shell-context";
import { useModels, useSelectedModel } from "@/lib/hooks/use-models";
import {
  calculateContextBreakdown,
  formatTokenCount,
  type ContextWindowBreakdown,
} from "@/app/agent-drawer/chat-utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Rss, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function ComposerSubmit({
  isLoading,
  input,
  status,
  stop,
}: {
  isLoading: boolean;
  input: string;
  status: string;
  stop: () => Promise<void>;
}) {
  const { files } = usePromptInputAttachments();
  const { t } = useTranslation();
  const hasContent = Boolean(input.trim() || files.length > 0);

  return (
    <PromptInputSubmit
      status={isLoading ? (status === "submitted" ? "submitted" : "streaming") : "ready"}
      onStop={() => void stop()}
      disabled={!isLoading && !hasContent}
      aria-label={isLoading ? t("common.stop") : t("common.send")}
      className={cn(
        "size-7 rounded-md ml-auto transition-colors",
        !isLoading &&
          hasContent &&
          "bg-editorial-primary text-editorial-ink-on-primary hover:bg-editorial-primary-active",
      )}
    />
  );
}

const CTX_CIRCLE_RADIUS = 5.5;
const CTX_CIRCUMFERENCE = 2 * Math.PI * CTX_CIRCLE_RADIUS;

function ContextWindowIndicator() {
  const { messages, status, latestUsage } = useChatContext();
  const { workspaceContext } = useAppShell();
  const { data: models = [] } = useModels("chat");
  const { data: selectedModelId = "" } = useSelectedModel("chat");
  const currentModel = models.find((m) => m.id === selectedModelId) ?? models[0];

  const [breakdown, setBreakdown] = useState<ContextWindowBreakdown>(() =>
    calculateContextBreakdown(messages, workspaceContext?.snippet, latestUsage),
  );

  // 流式生成完毕、会话切换或收到 API 精确 Token 时全量更新 Token 构成
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    setBreakdown(calculateContextBreakdown(messages, workspaceContext?.snippet, latestUsage));
  }, [status, messages, workspaceContext?.snippet, latestUsage]);

  const maxTokens = currentModel?.contextWindow ? currentModel.contextWindow * 1000 : null;
  const ratio = maxTokens ? breakdown.totalTokens / maxTokens : 0;
  const percent = maxTokens ? (ratio * 100).toFixed(1) : null;
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const strokeDashoffset = CTX_CIRCUMFERENCE * (1 - clampedRatio);

  const usageText = maxTokens
    ? `${formatTokenCount(breakdown.totalTokens)} / ${formatTokenCount(maxTokens)}`
    : `${formatTokenCount(breakdown.totalTokens)}`;

  const isWarning = ratio >= 0.8;
  const isDanger = ratio >= 0.95;

  const systemPercent =
    breakdown.totalTokens > 0
      ? `${((breakdown.systemTokens / breakdown.totalTokens) * 100).toFixed(0)}%`
      : "0%";
  const chatPercent =
    breakdown.totalTokens > 0
      ? `${((breakdown.chatTokens / breakdown.totalTokens) * 100).toFixed(0)}%`
      : "0%";
  const toolPercent =
    breakdown.totalTokens > 0
      ? `${((breakdown.toolTokens / breakdown.totalTokens) * 100).toFixed(0)}%`
      : "0%";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex size-7 items-center justify-center rounded-md select-none transition-colors cursor-default",
              isDanger
                ? "text-editorial-semantic-error hover:bg-editorial-semantic-error/10"
                : isWarning
                  ? "text-editorial-semantic-warning hover:bg-editorial-semantic-warning/10"
                  : "text-editorial-ink-muted/80 hover:text-editorial-ink hover:bg-editorial-surface-soft",
            )}
            aria-label={
              maxTokens ? `上下文用量: ${usageText} (${percent}%)` : `上下文用量: ${usageText}`
            }
          >
            <svg className="size-4 -rotate-90" viewBox="0 0 16 16" aria-hidden="true">
              <circle
                cx="8"
                cy="8"
                r={CTX_CIRCLE_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-20"
              />
              {clampedRatio > 0 && (
                <circle
                  cx="8"
                  cy="8"
                  r={CTX_CIRCLE_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={CTX_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
              )}
            </svg>
          </button>
        }
      />
      <TooltipContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 p-3 space-y-2.5 bg-editorial-surface-dark border border-editorial-hairline-strong/60 text-editorial-ink-on-dark shadow-island rounded-lg select-none"
      >
        <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden flex">
          {breakdown.totalTokens > 0 ? (
            <>
              <div
                style={{ width: `${(breakdown.systemTokens / breakdown.totalTokens) * 100}%` }}
                className="h-full bg-zinc-400"
              />
              <div
                style={{ width: `${(breakdown.chatTokens / breakdown.totalTokens) * 100}%` }}
                className="h-full bg-sky-400"
              />
              <div
                style={{ width: `${(breakdown.toolTokens / breakdown.totalTokens) * 100}%` }}
                className="h-full bg-amber-400"
              />
            </>
          ) : (
            <div className="h-full w-full bg-white/5" />
          )}
        </div>

        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-white/80">
              <span className="size-1.5 rounded-full shrink-0 bg-zinc-400" />
              <span>系统</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span>{formatTokenCount(breakdown.systemTokens)}</span>
              <span className="text-[10px] text-white/45 w-8 text-right">{systemPercent}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-white/80">
              <span className="size-1.5 rounded-full shrink-0 bg-sky-400" />
              <span>对话</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span>{formatTokenCount(breakdown.chatTokens)}</span>
              <span className="text-[10px] text-white/45 w-8 text-right">{chatPercent}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-white/80">
              <span className="size-1.5 rounded-full shrink-0 bg-amber-400" />
              <span>工具</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span>{formatTokenCount(breakdown.toolTokens)}</span>
              <span className="text-[10px] text-white/45 w-8 text-right">{toolPercent}</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between text-white/70">
            <span>上下文占用</span>
            <span className="font-mono text-white/90">
              {maxTokens
                ? `${formatTokenCount(breakdown.totalTokens)} / ${formatTokenCount(maxTokens)} (${percent}%)`
                : `${formatTokenCount(breakdown.totalTokens)} tokens`}
            </span>
          </div>
          <div className="flex items-center justify-between text-white/70">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full shrink-0 bg-emerald-400" />
              <span>缓存命中率</span>
            </div>
            <span className="font-mono text-emerald-400">
              {breakdown.cachedTokens > 0
                ? `${formatTokenCount(breakdown.cachedTokens)} (${breakdown.cacheHitRate})`
                : breakdown.cacheHitRate}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface ComposerProps {
  className?: string;
  textareaClassName?: string;
}

export function Composer({ className, textareaClassName }: ComposerProps) {
  const { sendMessage, status, stop } = useChatContext();
  const { workspaceContext, setWorkspaceContext } = useAppShell();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((!text && (!message.files || message.files.length === 0)) || isLoading) return;
    void sendMessage({ text, files: message.files });
    setInput("");
  };

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className={cn(
        "w-full rounded-lg border border-editorial-hairline bg-editorial-surface-card shadow-island transition-all focus-within:border-editorial-hairline-strong focus-within:ring-1 focus-within:ring-editorial-accent/20",
        className,
      )}
    >
      <PromptInputAttachments />
      {workspaceContext && (
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-editorial-hairline bg-editorial-surface-soft px-2.5 py-0.5 text-tiny text-editorial-ink">
            <Rss size={11} className="text-editorial-accent shrink-0" />
            <span className="font-medium max-w-[220px] truncate">{workspaceContext.feedTitle}</span>
            <button
              type="button"
              onClick={() => setWorkspaceContext(null)}
              aria-label="移除上下文"
              className="ml-0.5 rounded-full p-0.5 text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-ink transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}
      <PromptInputBody>
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          aria-label={t("chat.placeholder")}
          placeholder={t("chat.placeholder")}
          disabled={isLoading}
          className={cn("min-h-[56px] text-body", textareaClassName)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <div className="flex items-center gap-1.5">
          <PromptInputAttachmentButton className="size-7 rounded-md" />
          <ChatModelSelector />
          <ContextWindowIndicator />
        </div>
        <ComposerSubmit isLoading={isLoading} input={input} status={status} stop={stop} />
      </PromptInputFooter>
    </PromptInput>
  );
}
