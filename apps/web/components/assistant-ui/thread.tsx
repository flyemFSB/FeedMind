"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDown } from "lucide-react";
import { messageComponents } from "./message";
import { Composer } from "./composer";
import {
  loadSelectedFeedMindModel,
  onSelectedFeedMindModelChange,
  setSelectedFeedMindModel,
} from "@/lib/api/agent";
import { listLLMModels } from "@/lib/api/llms";

const suggestions = [
  "总结最近这段对话中的重点内容",
  "帮我生成一份竞品研究报告大纲",
  "检索浏览器 AI 插件的产品趋势",
];

export function Thread() {
  const [canSendMessage, setCanSendMessage] = useState(false);

  useEffect(() => {
    let disposed = false;

    const refreshModelStatus = async (signal?: AbortSignal) => {
      const models = await listLLMModels(signal);
      if (disposed) return;

      if (models.length === 0) {
        setSelectedFeedMindModel("");
        setCanSendMessage(false);
        return;
      }

      const selectedModel = await loadSelectedFeedMindModel(signal);
      if (disposed) return;

      setCanSendMessage(models.some((model) => model.id === selectedModel));
    };

    const controller = new AbortController();
    void refreshModelStatus(controller.signal).catch(() => {
      if (!disposed) setCanSendMessage(false);
    });

    const handleModelsChange = () => {
      void refreshModelStatus().catch(() => setCanSendMessage(false));
    };

    window.addEventListener("feedmind:llms-change", handleModelsChange);
    const unsubscribe = onSelectedFeedMindModelChange((model) => {
      setCanSendMessage(model.trim().length > 0);
    });

    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener("feedmind:llms-change", handleModelsChange);
      unsubscribe();
    };
  }, []);

  return (
    <ThreadPrimitive.Root className="relative flex h-full min-h-0 flex-col bg-white">
      <ThreadPrimitive.Viewport className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 pb-[172px] space-y-6">
          <ThreadPrimitive.Empty>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#2997ff] flex items-center justify-center mb-4">
                <Image
                  src="/FeedMind-logo.png"
                  alt="FeedMind Agent"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-2xl object-cover"
                  priority
                />
              </div>
              <h2 className="text-[24px] font-semibold text-[#1d1d1f] tracking-[-0.2px] mb-2">
                FeedMind Agent
              </h2>
              <p className="text-[14px] text-[#86868b] max-w-md leading-relaxed">
                输入你的研究任务，我将检索网络资料、整合关键洞察并生成结构化报告。
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-xl">
                {suggestions.map((suggestion) => (
                  <ThreadPrimitive.Suggestion
                    key={suggestion}
                    prompt={suggestion}
                    send
                    disabled={!canSendMessage}
                    title={canSendMessage ? suggestion : "请先配置模型"}
                    className="px-3 py-2 rounded-xl border border-[#d2d2d7] text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
                  >
                    {suggestion}
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages components={messageComponents} />
          <ThreadPrimitive.ViewportFooter className="h-2" />
        </div>

        <ThreadPrimitive.ScrollToBottom
          behavior="smooth"
          className="absolute right-6 bottom-[150px] w-9 h-9 rounded-full bg-white border border-[#d2d2d7] shadow-sm text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center justify-center transition-colors disabled:hidden"
          title="滚动到底部"
        >
          <ArrowDown size={16} strokeWidth={1.8} />
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-6 pt-16">
        <div className="absolute inset-y-0 left-6 right-6 z-0 mx-auto max-w-3xl bg-gradient-to-t from-white via-white/95 to-transparent" />
        <div className="relative z-10 pointer-events-auto">
          <Composer canSendMessage={canSendMessage} />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}
