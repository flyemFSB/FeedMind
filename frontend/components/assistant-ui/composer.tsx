"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Plus, Square, X } from "lucide-react";
import {
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";

function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-2 max-w-[220px] rounded-xl border border-[#d2d2d7] bg-[#f5f5f7] px-3 py-2 text-[12px] text-[#1d1d1f]">
      <FileText size={14} className="text-[#86868b] shrink-0" />
      <span className="truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-auto rounded-md p-0.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-white transition-colors"
          title="移除附件"
        >
          <X size={13} strokeWidth={1.8} />
        </Button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function ImeSafeComposerInput({ canSendMessage }: { canSendMessage: boolean }) {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);
  const disabled = useAuiState(
    (state) => state.thread.isDisabled || state.composer.dictation?.inputDisabled,
  );
  const inputDisabled = disabled || !canSendMessage;
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
    <textarea
      rows={2}
      disabled={inputDisabled}
      value={value}
      placeholder={canSendMessage ? "输入你的研究任务..." : "请先配置模型"}
      className="block min-h-[64px] max-h-[220px] w-full resize-none border-0 bg-transparent text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      style={{ lineHeight: "1.5" }}
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
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !isComposingRef.current &&
          !event.nativeEvent.isComposing &&
          canSendMessage
        ) {
          event.preventDefault();
          aui.composer().send();
        }
      }}
    />
  );
}

export function Composer({ canSendMessage }: { canSendMessage: boolean }) {
  return (
    <div className="pointer-events-auto">
      <ComposerPrimitive.Root className="max-w-3xl mx-auto space-y-3">
        <ComposerPrimitive.Attachments>
          {() => <ComposerAttachment />}
        </ComposerPrimitive.Attachments>

        <div className="rounded-[28px] border border-[#d2d2d7] bg-white p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
          <ImeSafeComposerInput canSendMessage={canSendMessage} />

          <div className="mt-3 flex items-center justify-between">
            <ComposerPrimitive.AddAttachment asChild>
              <Button variant="ghost" size="icon-lg" className="rounded-full text-[#1d1d1f] hover:bg-[#f5f5f7]">
                <Plus size={21} strokeWidth={1.8} />
              </Button>
            </ComposerPrimitive.AddAttachment>

            <div className="grid h-10 w-10 place-items-center">
              <AuiIf condition={(state) => !state.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <Button
                    size="icon-lg"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1d1f] text-white transition-colors hover:bg-[#3a3a3c] disabled:bg-[#d2d2d7] disabled:text-white"
                    disabled={!canSendMessage}
                    title={canSendMessage ? "发送" : "请先配置模型"}
                  >
                    <ArrowUp size={18} strokeWidth={2.2} />
                  </Button>
                </ComposerPrimitive.Send>
              </AuiIf>

              <AuiIf condition={(state) => state.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <Button
                    variant="secondary"
                    size="icon-lg"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f] transition-colors hover:bg-[#e8e8ed]"
                    title="停止生成"
                  >
                    <Square size={16} strokeWidth={2} fill="currentColor" />
                  </Button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
}
