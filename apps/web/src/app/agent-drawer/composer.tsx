/**
 * Composer — 消息输入组件
 * 使用官方 ai-elements PromptInput 组合：
 * PromptInput(InputGroup 单边框) → PromptInputTextarea + PromptInputFooter → PromptInputSubmit
 * 全部为 ai-elements 内置组件，无自定义嵌套框
 */

import { useState } from "react";
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
import { FileText, Rss, X } from "lucide-react";
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
            {workspaceContext.type === "wiki" ? (
              <FileText size={11} className="text-editorial-primary shrink-0" />
            ) : (
              <Rss size={11} className="text-editorial-accent shrink-0" />
            )}
            <span className="font-medium max-w-[220px] truncate">
              {workspaceContext.type === "wiki"
                ? `${workspaceContext.pageTitle || workspaceContext.pageId}${
                    workspaceContext.spaceId ? ` (${workspaceContext.spaceId})` : ""
                  }`
                : workspaceContext.feedTitle}
            </span>
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
        </div>
        <ComposerSubmit isLoading={isLoading} input={input} status={status} stop={stop} />
      </PromptInputFooter>
    </PromptInput>
  );
}
