"use client";

import { useMemo } from "react";
import { Rss, Globe, Sparkles, Heart, MessageCircle, BookOpen, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feeds/")({
  component: FeedsIndexPage,
});

type FeedItemType = "rss" | "social" | "ai";

interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  source: string;
  sourceIcon?: string;
  author?: string;
  time: Date;
  excerpt: string;
  tags?: string[];
  platform?: string;
  reason?: string;
  likes?: number;
  comments?: number;
}

function generateMockItems(): FeedItem[] {
  const now = Date.now();
  return [
    {
      id: "r1",
      type: "rss",
      title: "2025 Q2 AI 模型能力对比：Claude Sonnet 4.6 领跑多项基准",
      source: "机器之心",
      time: new Date(now - 1000 * 60 * 25),
      excerpt:
        "最新评测显示，Claude Sonnet 4.6 在数学推理、代码生成和多轮对话等维度上均取得领先成绩...",
      tags: ["AI", "评测"],
      platform: "RSS",
    },
    {
      id: "r2",
      type: "rss",
      title: "Rust 2026 Edition 路线图发布：异步编程与编译性能优化",
      source: "Rust 官方博客",
      time: new Date(now - 1000 * 60 * 120),
      excerpt:
        "Rust 团队公布了 2026 Edition 的关键目标，包括 async 生态整合、编译速度提升和更友好的错误信息...",
      tags: ["Rust", "编程"],
      platform: "RSS",
    },
    {
      id: "r3",
      type: "rss",
      title: "Web 性能优化实战：Core Web Vitals 全面解读",
      source: "InfoQ",
      time: new Date(now - 1000 * 60 * 240),
      excerpt:
        "从 LCP、FID、CLS 三个核心指标出发，介绍如何通过资源预加载、代码分割和布局稳定性优化来提升用户体验...",
      tags: ["前端", "性能"],
      platform: "RSS",
    },
    {
      id: "s1",
      type: "social",
      title: "分享一篇关于知识图谱构建的深度文章",
      source: "小红书",
      author: "AI 研究笔记",
      time: new Date(now - 1000 * 60 * 45),
      excerpt:
        "用双编码器模型做实体链接的实践总结，附开源代码和数据集链接，适合入门知识图谱的工程师阅读。",
      tags: ["知识图谱", "NLP"],
      platform: "小红书",
      likes: 234,
      comments: 18,
    },
    {
      id: "s2",
      type: "social",
      title: "Mastra Agent 框架的新玩法",
      source: "B站",
      author: "全栈小白",
      time: new Date(now - 1000 * 60 * 180),
      excerpt: "用 Mastra 搭建一个多工具协作 Agent，从爬虫到数据分析再到自动生成报告，一条龙搞定。",
      tags: ["Agent", "Mastra"],
      platform: "B站",
      likes: 567,
      comments: 42,
    },
    {
      id: "a1",
      type: "ai",
      title: "从 RAG 到 GraphRAG：知识增强生成的技术演进",
      source: "FeedMind AI",
      time: new Date(now - 1000 * 60 * 30),
      excerpt: "基于你近期对知识管理和检索增强的兴趣，推荐这篇梳理 RAG 技术发展脉络的综述。",
      reason: "基于你近期对知识图谱和 RAG 的关注",
      tags: ["RAG", "知识管理"],
    },
    {
      id: "a2",
      type: "ai",
      title: "深入理解 WebSocket 重连机制与心跳保活",
      source: "FeedMind AI",
      time: new Date(now - 1000 * 60 * 90),
      excerpt:
        "你在远程连接模块中使用了 WebSocket，这篇关于异常断线检测和指数退避重连策略的文章可能对你有帮助。",
      reason: "与近期项目开发相关",
      tags: ["WebSocket", "网络"],
    },
    {
      id: "a3",
      type: "ai",
      title: "LLM 结构化输出的工程化方案",
      source: "FeedMind AI",
      time: new Date(now - 1000 * 60 * 300),
      excerpt:
        "对比 JSON mode、Tool calling 和 Structured Output 三种方案的优缺点，以及在实际项目中的选型建议。",
      reason: "与你常用 OpenAI SDK 和 Zod 验证的模式相关",
      tags: ["LLM", "工程实践"],
    },
    {
      id: "a4",
      type: "ai",
      title: "Tailwind CSS v4 新特性一览",
      source: "FeedMind AI",
      time: new Date(now - 1000 * 60 * 480),
      excerpt:
        "项目已升级到 Tailwind v4，这篇指南介绍了 CSS-first 配置、新增的 @theme 指令以及与 shadcn/ui 的集成方式。",
      reason: "与项目技术栈直接相关",
      tags: ["CSS", "Tailwind"],
    },
  ];
}

const PLATFORM_STYLES: Record<string, { bg: string; dot: string }> = {
  RSS: { bg: "bg-editorial-gradient-mint/30", dot: "bg-editorial-gradient-mint" },
  小红书: { bg: "bg-editorial-gradient-rose/30", dot: "bg-editorial-gradient-rose" },
  B站: { bg: "bg-editorial-gradient-sky/30", dot: "bg-editorial-gradient-sky" },
};

function FeedsIndexPage() {
  const { t } = useTranslation();
  const items = useMemo(() => generateMockItems(), []);

  const rssItems = items.filter((i) => i.type === "rss");
  const socialItems = items.filter((i) => i.type === "social");
  const aiItems = items.filter((i) => i.type === "ai");

  return (
    <div className="h-full p-6 max-sm:p-4 overflow-y-auto">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <FeedSection
            icon={Heart}
            title={t("feeds.social")}
            description={t("feeds.socialSectionDesc")}
            count={socialItems.length}
          >
            {socialItems.length === 0 ? (
              <FeedEmptyState message={t("feeds.noFollowed")} />
            ) : (
              socialItems.map((item) => <FeedCard key={item.id} item={item} />)
            )}
          </FeedSection>

          <FeedSection
            icon={Globe}
            title={t("feeds.rss")}
            description={t("feeds.rssSectionDesc")}
            count={rssItems.length}
          >
            {rssItems.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </FeedSection>

          <FeedSection
            icon={Sparkles}
            title={t("feeds.aiRecommend")}
            description={t("feeds.aiSectionDesc")}
            count={aiItems.length}
          >
            {aiItems.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </FeedSection>
        </div>
      </div>
    </div>
  );
}

function FeedSection({
  icon: Icon,
  title,
  description,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-editorial-surface-strong">
              <Icon size={14} className="text-editorial-ink" />
            </div>
            <h2 className="text-[15px] font-semibold text-editorial-ink">{title}</h2>
          </div>
          <p className="mt-1 text-[12px] text-editorial-ink-muted">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-editorial-surface-strong px-2 py-0.5 text-[11px] font-medium text-editorial-ink-soft tabular-nums">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const { t } = useTranslation();

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("feeds.justNow");
    if (minutes < 60) return t("feeds.minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("feeds.hours", { count: hours });
    return t("feeds.days", { count: Math.floor(hours / 24) });
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group cursor-pointer rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 transition-all duration-150 ease-out hover:border-editorial-hairline-strong"
    >
      <div className="mb-2 flex items-center gap-2">
        {item.platform && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              PLATFORM_STYLES[item.platform]?.bg ?? "bg-editorial-surface-soft",
            )}
          >
            {item.platform === "RSS" && <Rss size={10} />}
            {item.type === "social" && item.platform === "小红书" && (
              <span className="h-[6px] w-[6px] rounded-full bg-editorial-gradient-rose" />
            )}
            {item.type === "social" && item.platform === "B站" && (
              <span className="h-[6px] w-[6px] rounded-full bg-editorial-gradient-sky" />
            )}
            {item.type === "ai" && <Sparkles size={10} className="text-editorial-ink-muted" />}
            {item.platform}
          </span>
        )}
        {item.author && <span className="text-[11px] text-editorial-ink-muted">{item.author}</span>}
      </div>

      <h3 className="mb-1 text-[14px] font-medium leading-snug text-editorial-ink transition-colors group-hover:text-editorial-primary line-clamp-2">
        {item.title}
      </h3>

      <p className="mb-2 text-[12px] leading-relaxed text-editorial-ink-soft line-clamp-2">
        {item.excerpt}
      </p>

      {item.reason && (
        <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-editorial-gradient-lavender/10 px-2.5 py-1.5">
          <Sparkles size={11} className="mt-px shrink-0 text-editorial-gradient-lavender" />
          <p className="text-[11px] leading-relaxed text-editorial-ink-muted">
            {t("feeds.aiRecommendReason")}：{item.reason}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-editorial-ink-muted">
          <span>{formatTime(item.time)}</span>
          {item.likes !== undefined && (
            <span className="flex items-center gap-1">
              <Heart size={11} />
              {item.likes}
            </span>
          )}
          {item.comments !== undefined && (
            <span className="flex items-center gap-1">
              <MessageCircle size={11} />
              {item.comments}
            </span>
          )}
        </div>
        <ExternalLink
          size={12}
          className="text-editorial-ink-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </motion.article>
  );
}

function FeedEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-8 text-center">
      <BookOpen size={20} className="mb-2 text-editorial-ink-muted" />
      <p className="text-[12px] text-editorial-ink-muted">{message}</p>
    </div>
  );
}
