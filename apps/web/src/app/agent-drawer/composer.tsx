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
} from "@/components/ai-elements/prompt-input";
import { useChatContext } from "@/app/agent-drawer/chat-context";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ComposerProps {
  className?: string;
  textareaClassName?: string;
}

export function Composer({ className, textareaClassName }: ComposerProps) {
  const { sendMessage, status, stop } = useChatContext();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (text: string) => {
    if (!text.trim() || isLoading) return;
    void sendMessage({ text: text.trim() });
    setInput("");
  };

  return (
    <PromptInput
      onSubmit={(message) => handleSubmit(message.text)}
      className={cn("w-full", className)}
    >
      <PromptInputBody>
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          aria-label={t("chat.placeholder")}
          placeholder={t("chat.placeholder")}
          disabled={isLoading}
          className={cn("min-h-[56px]", textareaClassName)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputSubmit
          status={isLoading ? (status === "submitted" ? "submitted" : "streaming") : "ready"}
          onStop={() => void stop()}
          disabled={!isLoading && !input.trim()}
          aria-label={isLoading ? t("common.stop") : t("common.send")}
          className="ml-auto"
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
