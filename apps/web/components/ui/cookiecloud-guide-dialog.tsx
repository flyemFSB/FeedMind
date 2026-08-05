"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Cookie, Puzzle, Server, KeyRound, Globe, Lightbulb, Copy, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { listContainerVariants, listItemVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface CookieCloudGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GuideStep {
  icon: LucideIcon;
  title: string;
  desc: string;
  code?: string;
}

/**
 * CookieCloud 配置引导弹窗。
 * 时间线式步骤 + 代码块示例 + 完成提示，带 stagger 进入动画。
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
      icon: Puzzle,
      title: t("feeds.cookieCloudStep1Title"),
      desc: t("feeds.cookieCloudStep1Desc"),
    },
    {
      icon: Server,
      title: t("feeds.cookieCloudStep2Title"),
      desc: t("feeds.cookieCloudStep2Desc"),
      code: t("feeds.cookieCloudStep2Code"),
    },
    {
      icon: KeyRound,
      title: t("feeds.cookieCloudStep3Title"),
      desc: t("feeds.cookieCloudStep3Desc"),
    },
    {
      icon: Globe,
      title: t("feeds.cookieCloudStep4Title"),
      desc: t("feeds.cookieCloudStep4Desc"),
      code: t("feeds.cookieCloudStep4Code"),
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
        className="flex max-h-[calc(100dvh-2rem)] max-w-[440px] flex-col gap-0 overflow-hidden rounded-xl bg-editorial-surface-card p-0 text-editorial-ink"
      >
        {/* 头部：图标徽标 + 标题 + 描述 */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-editorial-hairline px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-editorial-accent/10 text-editorial-accent">
              <Cookie size={16} />
            </span>
            <DialogTitle className="pt-0 text-[15px] font-semibold leading-snug text-editorial-ink">
              {t("feeds.cookieCloudGuideTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] leading-relaxed text-editorial-ink-muted">
            {t("feeds.cookieCloudGuideDesc")}
          </DialogDescription>
        </div>

        {/* 步骤时间线 */}
        <motion.ol
          variants={listContainerVariants}
          initial="initial"
          animate="animate"
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === steps.length - 1;
            const code = step.code;
            return (
              <motion.li
                key={step.title}
                variants={listItemVariants}
                className="relative flex gap-3"
              >
                {/* 左侧节点 + 连接线 */}
                <div className="flex shrink-0 flex-col items-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-hairline-strong bg-editorial-surface-soft text-editorial-ink-soft">
                    <Icon size={12} />
                  </span>
                  {!isLast && (
                    <span className="w-px flex-1 bg-editorial-hairline-strong" aria-hidden />
                  )}
                </div>
                {/* 步骤内容 */}
                <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
                  <h3 className="text-[13px] font-semibold text-editorial-ink">{step.title}</h3>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-editorial-ink-muted">
                    {step.desc}
                  </p>
                  {code && (
                    <div className="relative mt-1.5">
                      <pre className="overflow-x-auto rounded-lg border border-editorial-hairline bg-editorial-surface-strong px-3 py-1.5 pr-20 text-[11px] leading-relaxed text-editorial-ink select-all">
                        <code>{code}</code>
                      </pre>
                      <button
                        type="button"
                        onClick={() => void handleCopy(code)}
                        className="absolute top-1 right-1.5 flex items-center gap-1 rounded-md bg-editorial-surface-soft px-1.5 py-0.5 text-[11px] font-medium text-editorial-ink-soft transition-colors hover:bg-editorial-surface-strong hover:text-editorial-ink"
                      >
                        {copied ? (
                          <Check size={12} className="text-editorial-semantic-success" />
                        ) : (
                          <Copy size={12} />
                        )}
                        {copied ? t("feeds.cookieCloudCopied") : t("feeds.cookieCloudCopy")}
                      </button>
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}

          {/* 完成提示 */}
          <motion.li
            variants={listItemVariants}
            className="mt-1.5 flex gap-2 rounded-lg border border-editorial-accent/15 bg-editorial-accent/5 px-3 py-2"
          >
            <Lightbulb size={14} className="mt-0.5 shrink-0 text-editorial-accent" />
            <p className="text-[12px] leading-relaxed text-editorial-ink/80">
              {t("feeds.cookieCloudGuideTip")}
            </p>
          </motion.li>
        </motion.ol>

        {/* 底部操作 */}
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t border-editorial-hairline bg-editorial-canvas-soft px-5 py-3">
          <DialogClose
            render={<Button variant="default" size="sm" className="h-8 px-4 text-[13px]" />}
          >
            {t("feeds.cookieCloudGuideGotIt")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
