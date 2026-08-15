"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Cookie, Copy, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface CookieCloudGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GuideStep {
  title: string;
  desc: string;
  code?: string;
  /** 代码块复制按钮的可访问名称（区分复制内容） */
  codeLabel?: string;
}

/**
 * CookieCloud 配置引导弹窗。
 * 单列时间轴步骤流：左侧序号圆圈 + 连接线，右侧内容按高度自适应，代码块内嵌复制按钮。
 */
export function CookieCloudGuideDialog({ open, onClose }: CookieCloudGuideDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async (text: string) => {
    const markCopied = () => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    };

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      // 剪贴板 API 不可用时回退到 execCommand（部分环境/权限下仍可复制）
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) markCopied();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const steps: GuideStep[] = [
    {
      title: t("feeds.cookieCloudStep1Title"),
      desc: t("feeds.cookieCloudStep1Desc"),
    },
    {
      title: t("feeds.cookieCloudStep2Title"),
      desc: t("feeds.cookieCloudStep2Desc"),
      code: t("feeds.cookieCloudStep2Code"),
      codeLabel: t("feeds.cookieCloudCopyServer"),
    },
    {
      title: t("feeds.cookieCloudStep3Title"),
      desc: t("feeds.cookieCloudStep3Desc"),
    },
    {
      title: t("feeds.cookieCloudStep4Title"),
      desc: t("feeds.cookieCloudStep4Desc"),
      code: t("feeds.cookieCloudStep4Code"),
      codeLabel: t("feeds.cookieCloudCopyDomains"),
    },
    {
      title: t("feeds.cookieCloudStep5Title"),
      desc: t("feeds.cookieCloudStep5Desc"),
      code: t("feeds.cookieCloudStep5Code"),
      codeLabel: t("feeds.cookieCloudCopyWeread"),
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink sm:max-w-[680px]"
      >
        {/* 头部：主题色徽标 + 标题 + 描述 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-editorial-hairline px-6 pt-5 pb-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-editorial-accent/10 text-editorial-accent">
            <Cookie size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="pt-0 text-[17px] font-semibold leading-snug text-editorial-ink">
              {t("feeds.cookieCloudGuideTitle")}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[12px] leading-snug text-editorial-ink-muted">
              {t("feeds.cookieCloudGuideDesc")}
            </DialogDescription>
          </div>
        </div>

        {/* 步骤：单列时间轴，左侧序号圆圈 + 连接线，右侧内容自适应 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <ol className="flex flex-col">
            {steps.map((step, i) => {
              const code = step.code;
              return (
                <li key={step.title} className="flex gap-4">
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-editorial-accent/10 text-[12px] font-semibold text-editorial-accent tabular-nums">
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && (
                      <span className="mt-2 w-px flex-1 bg-editorial-hairline-strong" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-6">
                    <h3 className="pt-1 text-[14px] font-semibold leading-snug text-editorial-ink">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-editorial-ink-soft">
                      {step.desc}
                    </p>
                    {code && step.codeLabel && (
                      <div className="relative mt-3">
                        <pre className="whitespace-pre rounded-md border border-editorial-hairline bg-editorial-surface-soft px-3 py-2 pr-16 text-[11.5px] leading-relaxed text-editorial-ink select-all">
                          <code>{code}</code>
                        </pre>
                        <button
                          type="button"
                          aria-label={step.codeLabel}
                          onClick={() => void handleCopy(code)}
                          className={`absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
                            copied
                              ? "bg-editorial-semantic-success/10 text-editorial-semantic-success ring-editorial-semantic-success/20"
                              : "bg-editorial-surface-card text-editorial-ink-soft ring-editorial-hairline hover:bg-editorial-surface-strong hover:text-editorial-ink"
                          }`}
                        >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                          {copied ? t("feeds.cookieCloudCopied") : t("feeds.cookieCloudCopy")}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* 提示：保持登录态（Info Alert，与步骤区分） */}
          <div className="flex items-start gap-2.5 rounded-lg border border-editorial-semantic-info/20 bg-editorial-semantic-info/10 px-4 py-3">
            <Info size={14} className="mt-0.5 shrink-0 text-editorial-semantic-info" />
            <p className="text-[12px] leading-relaxed text-editorial-ink-soft">
              {t("feeds.cookieCloudGuideTip")}
            </p>
          </div>
        </div>

        {/* 底部操作 */}
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-lg border-t border-editorial-hairline bg-editorial-canvas-soft px-6 py-3.5">
          <DialogClose
            render={<Button variant="outline" size="sm" className="h-8 px-4 text-[13px]" />}
          >
            {t("feeds.cookieCloudGuideGotIt")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
