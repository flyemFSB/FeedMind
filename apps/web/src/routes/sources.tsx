"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Rss, Globe, Cookie, Upload, Bookmark, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Xiaohongshu, Douyin, Bilibili, Zhihu } from "@/components/icons/remote-connection-icons";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
});

const PLATFORMS = [
  { id: "all", label: "全部", icon: User },
  { id: "小红书", label: "小红书", icon: Xiaohongshu },
  { id: "B站", label: "B站", icon: Bilibili },
  { id: "抖音", label: "抖音", icon: Douyin },
  { id: "知乎", label: "知乎", icon: Zhihu },
] as const;

const COOKIE_PLATFORMS = [
  { id: "xiaohongshu", label: "小红书", icon: Xiaohongshu },
  { id: "bilibili", label: "B站", icon: Bilibili },
  { id: "douyin", label: "抖音", icon: Douyin },
  { id: "zhihu", label: "知乎", icon: Zhihu },
];

const INITIAL_RSS = [
  { id: "1", url: "https://feeds.example.com/tech-news", title: "科技资讯" },
  { id: "2", url: "https://feeds.example.com/ai-latest", title: "AI 前沿" },
  { id: "3", url: "https://feeds.example.com/oss-weekly", title: "开源周报" },
  { id: "4", url: "https://feeds.example.com/design-insight", title: "设计洞察" },
];

const INITIAL_SUBS = [
  { id: "s1", platform: "小红书", username: "我", type: "投稿" as const },
  { id: "s2", platform: "小红书", username: "小红薯", type: "收藏夹" as const },
  { id: "s3", platform: "B站", username: "我", type: "投稿" as const },
  { id: "s4", platform: "B站", username: "全栈小白", type: "投稿" as const },
  { id: "s5", platform: "B站", username: "AI 研究笔记", type: "收藏夹" as const },
  { id: "s6", platform: "抖音", username: "我", type: "投稿" as const },
  { id: "s7", platform: "知乎", username: "我", type: "收藏夹" as const },
  { id: "s8", platform: "知乎", username: "AI 频道", type: "投稿" as const },
];

function SourcesPage() {
  const { t } = useTranslation();

  const [rssSources, setRssSources] = useState(INITIAL_RSS);
  const [newUrl, setNewUrl] = useState("");

  const [subs, setSubs] = useState(INITIAL_SUBS);
  const [activeTab, setActiveTab] = useState("all");
  const [newSubUrl, setNewSubUrl] = useState("");

  const [cookiecloudUuid, setCookiecloudUuid] = useState("");
  const [cookiecloudPassword, setCookiecloudPassword] = useState("");

  const [cookieStatus, setCookieStatus] = useState<Record<string, boolean>>({
    xiaohongshu: false,
    bilibili: false,
    douyin: false,
    zhihu: false,
  });

  const filteredSubs = activeTab === "all" ? subs : subs.filter((s) => s.platform === activeTab);

  const handleAddSub = useCallback(() => {
    const url = newSubUrl.trim();
    if (!url) return;
    const platformHint =
      url.includes("xiaohongshu") || url.includes("xhs")
        ? "小红书"
        : url.includes("bilibili") || url.includes("b23")
          ? "B站"
          : url.includes("douyin") || url.includes("tiktok")
            ? "抖音"
            : url.includes("zhihu")
              ? "知乎"
              : "小红书";
    setSubs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), platform: platformHint, username: "我", type: "投稿" },
    ]);
    setNewSubUrl("");
  }, [newSubUrl]);

  useEffect(() => {
    fetch("/api/v1/cookiecloud/cookies")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const status: Record<string, boolean> = {
          xiaohongshu: false,
          bilibili: false,
          douyin: false,
          zhihu: false,
        };
        for (const row of data) {
          if (row.platform in status) status[row.platform] = true;
        }
        setCookieStatus(status);
      })
      .catch(() => {});
  }, []);

  return (
    <LayoutWrapper title={t("feeds.sourceManagement")}>
      <div className="flex h-full overflow-y-auto">
        {/* 左侧双列 */}
        <div className="flex min-w-0 flex-1 gap-5 p-6 max-sm:flex-col max-sm:p-4">
          {/* 社交媒体订阅 */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-editorial-gradient-rose/20">
                    <User size={14} className="text-editorial-gradient-rose" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-editorial-ink">社交媒体</h2>
                </div>
                <p className="mt-1 text-[12px] text-editorial-ink-muted">
                  管理来自小红书、B站、抖音、知乎的订阅
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-editorial-surface-strong px-2 py-0.5 text-[11px] font-medium text-editorial-ink-soft tabular-nums">
                {subs.length}
              </span>
            </div>

            {/* 输入框 */}
            <div className="flex items-center gap-2">
              <input
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSub()}
                placeholder="粘贴用户主页链接添加订阅"
                className="min-w-0 flex-1 rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
              />
              <Button
                onClick={handleAddSub}
                disabled={!newSubUrl.trim()}
                size="sm"
                className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-[12px]"
              >
                <Plus size={14} />
                添加
              </Button>
            </div>

            {/* 平台标签 */}
            <div className="flex gap-1">
              {PLATFORMS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      activeTab === tab.id
                        ? "bg-editorial-surface-strong text-editorial-ink"
                        : "text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink",
                    )}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* 订阅列表 */}
            <div className="flex flex-col gap-2">
              {filteredSubs.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
                  <User size={22} className="mb-2 text-editorial-ink-muted" />
                  <p className="text-[13px] text-editorial-ink-muted">暂无订阅</p>
                </div>
              ) : (
                filteredSubs.map((sub) => {
                  const tab = PLATFORMS.find((p) => p.id === sub.platform);
                  const Icon = tab?.icon ?? User;
                  return (
                    <div
                      key={sub.id}
                      className="group flex items-center gap-3 rounded-xl border border-editorial-hairline bg-editorial-surface-card px-3.5 py-3 transition-all duration-150 ease-out hover:border-editorial-hairline-strong hover:shadow-sm"
                    >
                      <Icon size={20} />
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-editorial-ink">
                          {sub.platform}
                        </span>
                        <span className="ml-2 text-[11px] text-editorial-ink-muted">
                          {sub.username}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {sub.type === "投稿" ? (
                          <Upload size={11} className="text-editorial-ink-muted" />
                        ) : (
                          <Bookmark size={11} className="text-editorial-ink-muted" />
                        )}
                        <span className="text-[11px] text-editorial-ink-muted">{sub.type}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubs((prev) => prev.filter((s) => s.id !== sub.id))}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 transition-all hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RSS */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-editorial-gradient-mint/20">
                    <Rss size={14} className="text-editorial-gradient-mint" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-editorial-ink">RSS</h2>
                </div>
                <p className="mt-1 text-[12px] text-editorial-ink-muted">管理 RSS 订阅源</p>
              </div>
              <span className="shrink-0 rounded-full bg-editorial-surface-strong px-2 py-0.5 text-[11px] font-medium text-editorial-ink-soft tabular-nums">
                {rssSources.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newUrl.trim()) {
                    setRssSources((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        url: newUrl.trim(),
                        title: newUrl
                          .trim()
                          .replace(/https?:\/\//, "")
                          .split("/")[0],
                      },
                    ]);
                    setNewUrl("");
                  }
                }}
                placeholder="输入 RSS 订阅链接"
                className="min-w-0 flex-1 rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
              />
              <Button
                onClick={() => {
                  if (!newUrl.trim()) return;
                  setRssSources((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      url: newUrl.trim(),
                      title: newUrl
                        .trim()
                        .replace(/https?:\/\//, "")
                        .split("/")[0],
                    },
                  ]);
                  setNewUrl("");
                }}
                disabled={!newUrl.trim()}
                size="sm"
                className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-[12px]"
              >
                <Plus size={14} />
                添加
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {rssSources.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
                  <Globe size={22} className="mb-2 text-editorial-ink-muted" />
                  <p className="text-[13px] text-editorial-ink-muted">暂无 RSS 订阅源</p>
                </div>
              ) : (
                rssSources.map((source) => (
                  <div
                    key={source.id}
                    className="group flex items-center gap-3 rounded-xl border border-editorial-hairline bg-editorial-surface-card px-3.5 py-3 transition-all duration-150 ease-out hover:border-editorial-hairline-strong hover:shadow-sm"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-editorial-gradient-mint/20">
                      <Rss size={13} className="text-editorial-gradient-mint" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-[13px] font-medium text-editorial-ink">
                        {source.title}
                      </span>
                      <p className="truncate text-[11px] text-editorial-ink-muted">{source.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRssSources((prev) => prev.filter((s) => s.id !== source.id))
                      }
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 transition-all hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="w-px shrink-0 bg-editorial-hairline my-6" />

        {/* 右侧列：Cookie 管理 */}
        <div className="flex w-96 shrink-0 flex-col gap-6 p-6 pl-8 max-lg:w-72 max-sm:w-full max-sm:p-4 max-sm:pl-4">
          {/* CookieCloud */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-editorial-gradient-lavender/20">
                  <Cookie size={14} className="text-editorial-gradient-lavender" />
                </div>
                <h2 className="text-[15px] font-semibold text-editorial-ink">CookieCloud</h2>
              </div>
              <p className="mt-1 text-[12px] text-editorial-ink-muted">
                通过 CookieCloud 浏览器扩展自动同步 Cookie
              </p>
            </div>
            <div className="rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 transition-all duration-150 ease-out hover:border-editorial-hairline-strong hover:shadow-sm">
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-editorial-ink-muted">
                    用户 KEY · UUID
                  </label>
                  <input
                    value={cookiecloudUuid}
                    onChange={(e) => setCookiecloudUuid(e.target.value)}
                    placeholder="输入 CookieCloud UUID"
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-editorial-ink-muted">
                    端对端加密密码
                  </label>
                  <input
                    type="password"
                    value={cookiecloudPassword}
                    onChange={(e) => setCookiecloudPassword(e.target.value)}
                    placeholder="输入加密密码"
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!cookiecloudUuid.trim() || !cookiecloudPassword.trim()) return;
                    fetch("/api/v1/cookiecloud/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        uuid: cookiecloudUuid,
                        password: cookiecloudPassword,
                        crypto_type: "legacy",
                      }),
                    });
                  }}
                  disabled={!cookiecloudUuid.trim() || !cookiecloudPassword.trim()}
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
                >
                  保存配置
                </Button>
              </div>
            </div>
          </div>

          {/* 账号 Cookie */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-editorial-gradient-sky/20">
                  <User size={14} className="text-editorial-gradient-sky" />
                </div>
                <h2 className="text-[15px] font-semibold text-editorial-ink">账号 Cookie</h2>
              </div>
              <p className="mt-1 text-[12px] text-editorial-ink-muted">
                从数据库读取各平台的登录 Cookie 状态
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {COOKIE_PLATFORMS.map((platform) => {
                const isConfigured = cookieStatus[platform.id] ?? false;
                return (
                  <div
                    key={platform.id}
                    className="group flex items-center gap-3 rounded-xl border border-editorial-hairline bg-editorial-surface-card px-3.5 py-3 transition-all duration-150 ease-out hover:border-editorial-hairline-strong hover:shadow-sm"
                  >
                    <platform.icon size={20} />
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-editorial-ink">
                      {platform.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                        isConfigured
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-editorial-surface-strong text-editorial-ink-muted",
                      )}
                    >
                      {isConfigured ? "已配置" : "未配置"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}
