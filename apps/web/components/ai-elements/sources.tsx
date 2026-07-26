/**
 * ai-elements Sources — 来源引用展示
 *
 * 对齐官方 Sources 组件结构：
 *   Sources (Collapsible)
 *     ├─ SourcesTrigger — 显示"已使用 N 个来源"
 *     └─ SourcesContent
 *          └─ Source × N — 可点击来源链接
 *
 * 与官方差异：
 * - 保留 FeedMind editorial 设计令牌
 * - 保留中文 i18n
 */
"use client";

import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCollapsibleOpen } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Book, ExternalLink, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { motionSpring } from "@/lib/motion";

/* ── Sources — 折叠容器 ── */
export type SourcesProps = ComponentProps<typeof Collapsible>;

export function Sources({ className, defaultOpen = false, ...props }: SourcesProps) {
  return (
    <Collapsible
      className={cn(
        "w-full overflow-hidden rounded-lg border border-editorial-hairline bg-editorial-surface-card",
        className,
      )}
      defaultOpen={defaultOpen}
      {...props}
    />
  );
}

/* ── SourcesTrigger — 来源数 + 展开按钮 ── */
export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export function SourcesTrigger({ className, count, children, ...props }: SourcesTriggerProps) {
  const { t } = useTranslation();
  const isOpen = useCollapsibleOpen();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] font-medium text-editorial-ink-soft hover:text-editorial-ink",
        className,
      )}
      {...props}
    >
      <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={motionSpring}>
        <ChevronRight size={14} className="shrink-0 text-editorial-ink-muted" />
      </motion.span>
      <Book size={14} className="shrink-0 text-editorial-ink-muted" />
      {children ?? <span>{t("chat.sourcesCount", { count })}</span>}
    </CollapsibleTrigger>
  );
}

/* ── SourcesContent — 来源列表容器 ── */
export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export function SourcesContent({ className, ...props }: SourcesContentProps) {
  return (
    <CollapsibleContent
      className={cn("flex flex-col gap-1 border-t border-editorial-hairline p-3", className)}
      {...props}
    />
  );
}

/* ── Source — 单条来源链接 ── */
export type SourceProps = ComponentProps<"a"> & {
  href: string;
  title?: string;
  favicon?: string;
};

export function Source({ className, href, title, children, ...props }: SourceProps) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug",
        "text-editorial-ink-soft hover:text-editorial-ink hover:bg-editorial-surface-soft",
        className,
      )}
      whileTap={{ scale: 0.99 }}
      {...props}
    >
      <ExternalLink size={12} className="shrink-0 text-editorial-ink-muted" />
      <span className="flex-1 truncate">{children ?? title ?? href}</span>
      <span className="shrink-0 text-[12px] text-editorial-ink-muted truncate max-w-[160px]">
        {extractDomain(href)}
      </span>
    </motion.a>
  );
}

/* ── 工具函数 ── */
function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
