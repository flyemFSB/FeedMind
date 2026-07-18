"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Rss, Globe, Cookie, User, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Xiaohongshu, Douyin, Bilibili, Zhihu } from "@/components/icons/remote-connection-icons";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
});

// ─── URL 解析 ────────────────────────────────────────────────

interface SocialInfo {
  platform: string;
  route: string;
  params: Record<string, string>;
}

function parseSocialUrl(url: string): SocialInfo | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;

    if (host.includes("bilibili.com") || host.includes("b23.tv")) {
      const m = path.match(/\/(\d+)/);
      if (m && m[1])
        return { platform: "bilibili", route: "bili/user/video", params: { uid: m[1] } };
    }
    if (host.includes("xiaohongshu.com")) {
      const m = path.match(/\/user\/profile\/([^/]+)/);
      if (m && m[1])
        return { platform: "xiaohongshu", route: "xhs/user/notes", params: { user_id: m[1] } };
    }
    if (host.includes("douyin.com")) {
      const m = path.match(/\/user\/([^/]+)/);
      if (m && m[1]) return { platform: "douyin", route: "dy/user", params: { uid: m[1] } };
    }
    if (host.includes("zhihu.com")) {
      const m = path.match(/\/people\/([^/]+)/) || path.match(/\/org\/([^/]+)/);
      if (m && m[1])
        return { platform: "zhihu", route: "zh/answers", params: { question_id: m[1] } };
      const qm = path.match(/\/question\/(\d+)/);
      if (qm && qm[1])
        return { platform: "zhihu", route: "zh/answers", params: { question_id: qm[1] } };
    }
  } catch {
    return null;
  }
  return null;
}

// ─── 平台图标 ────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  bilibili: Bilibili,
  douyin: Douyin,
  xiaohongshu: Xiaohongshu,
  zhihu: Zhihu,
};

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: "feeds.platformBilibili",
  douyin: "feeds.platformDouyin",
  xiaohongshu: "feeds.platformXiaohongshu",
  zhihu: "feeds.platformZhihu",
};

// ─── API ─────────────────────────────────────────────────────

interface RssSource {
  id: string;
  type: "rss" | "social";
  platform: string | null;
  route: string | null;
  url: string;
  title: string;
  params: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchSources(): Promise<RssSource[]> {
  const res = await fetch("/api/v1/rss-sources");
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

async function addSource(body: object): Promise<void> {
  const res = await fetch("/api/v1/rss-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("addFailed");
}

async function removeSource(id: string): Promise<void> {
  const res = await fetch(`/api/v1/rss-sources/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("deleteFailed");
}

async function syncAllFeeds(): Promise<void> {
  const res = await fetch("/api/v1/feeds/sync", { method: "POST" });
  if (!res.ok) throw new Error("syncFailed");
}

// ─── 页面 ────────────────────────────────────────────────────

function SourcesPage() {
  const { t } = useTranslation();

  const [sources, setSources] = useState<RssSource[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [syncing, setSyncing] = useState(false);

  // CookieCloud
  const [cookiecloudUuid, setCookiecloudUuid] = useState("");
  const [cookiecloudPassword, setCookiecloudPassword] = useState("");
  const [hasConfig, setHasConfig] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [cookieStatus, setCookieStatus] = useState<Record<string, boolean>>({
    xiaohongshu: false,
    bilibili: false,
    douyin: false,
    zhihu: false,
  });

  const loadSources = useCallback(async () => {
    try {
      const data = await fetchSources();
      setSources(data);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    fetch("/api/v1/cookiecloud/cookies")
      .then((r) => r.json())
      .then((data) => {
        const list = data?.data ?? data;
        if (!Array.isArray(list)) return;
        const status: Record<string, boolean> = {
          xiaohongshu: false,
          bilibili: false,
          douyin: false,
          zhihu: false,
        };
        for (const row of list) {
          if (row.platform in status) status[row.platform] = true;
        }
        setCookieStatus(status);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/v1/cookiecloud/config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.data && data.data.length > 0) {
          setCookiecloudUuid(data.data[0].uuid);
          setHasConfig(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;

    try {
      const social = parseSocialUrl(url);
      if (social) {
        await addSource({
          type: "social",
          platform: social.platform,
          route: social.route,
          url,
          params: social.params,
        });
      } else {
        await addSource({ type: "rss", url });
      }
      setNewUrl("");
      await loadSources();
      toast.success(t("feeds.addSuccess"));
    } catch {
      toast.error(t("feeds.addError"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeSource(id);
      await loadSources();
      toast.success(t("feeds.deleteSuccess"));
    } catch {
      toast.error(t("feeds.deleteError"));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAllFeeds();
      toast.success(t("feeds.syncSuccess"));
    } catch {
      toast.error(t("feeds.syncError"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <LayoutWrapper title={t("feeds.sourceManagement")}>
      <div className="flex h-full min-w-0 overflow-y-auto max-sm:flex-col">
        <div className="flex min-w-0 flex-1 gap-5 p-6 max-sm:flex-col max-sm:p-4">
          {/* 左：订阅列表 */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] text-editorial-ink-soft">{t("feeds.pasteLinkHint")}</p>
              </div>
              <Button
                onClick={handleSync}
                disabled={syncing}
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
              >
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                {t("feeds.sync")}
              </Button>
            </div>

            {/* 输入框 */}
            <div className="flex items-center gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder={t("feeds.inputPlaceholder")}
                className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
              />
              <Button
                onClick={handleAdd}
                disabled={!newUrl.trim()}
                size="sm"
                className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-[12px]"
              >
                <Plus size={14} />
                {t("feeds.add")}
              </Button>
            </div>

            {/* 列表 */}
            {sources.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
                <Globe size={22} className="mb-2 text-editorial-ink-muted" />
                <p className="text-[13px] text-editorial-ink-muted">{t("feeds.noSubscriptions")}</p>
              </div>
            ) : (
              <div className="divide-y divide-editorial-hairline border-y border-editorial-hairline">
                {sources.map((source) => {
                  const Icon =
                    source.type === "social" && source.platform
                      ? (PLATFORM_ICONS[source.platform] ?? Globe)
                      : Rss;
                  return (
                    <div
                      key={source.id}
                      className="group flex items-center gap-3 px-2 py-3 transition-colors hover:bg-editorial-surface-soft"
                    >
                      <Icon size={20} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-editorial-ink truncate">
                            {source.title}
                          </span>
                          {source.type === "social" && source.platform && (
                            <span className="shrink-0 rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[12px] text-editorial-ink-muted">
                              {t(PLATFORM_LABELS[source.platform] ?? source.platform)}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[12px] text-editorial-ink-muted">
                          {source.type === "social" ? source.url : source.url}
                          {source.last_synced_at && (
                            <>
                              {" "}
                              ·{" "}
                              {t("feeds.syncedAt", {
                                time: new Date(source.last_synced_at).toLocaleString(),
                              })}
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(source.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 transition-[opacity,background-color,color] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-out)] hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="my-6 w-px shrink-0 bg-editorial-hairline max-sm:hidden" />

        {/* 右：Cookie 管理 */}
        <div className="flex w-96 shrink-0 flex-col gap-6 p-6 pl-8 max-lg:w-72 max-sm:w-full max-sm:p-4 max-sm:pl-4">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Cookie size={15} className="text-editorial-ink-soft" />
                <h2 className="text-[16px] font-semibold text-editorial-ink">CookieCloud</h2>
              </div>
              <p className="mt-1 text-[12px] text-editorial-ink-muted">
                {t("feeds.cookieCloudDesc")}
              </p>
            </div>
            <div className="rounded-lg border border-editorial-hairline bg-editorial-surface-card p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-editorial-ink-muted">
                    {t("feeds.cookieUuidLabel")}
                  </label>
                  <input
                    value={cookiecloudUuid}
                    onChange={(e) => setCookiecloudUuid(e.target.value)}
                    readOnly={hasConfig}
                    placeholder={hasConfig ? "" : t("feeds.cookieUuidPlaceholder")}
                    className="w-full rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted read-only:cursor-not-allowed read-only:text-editorial-ink-muted"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-editorial-ink-muted">
                    {t("feeds.cookiePasswordLabel")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={cookiecloudPassword}
                      onChange={(e) => setCookiecloudPassword(e.target.value)}
                      placeholder={hasConfig ? "******" : "输入加密密码"}
                      className="w-full rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-9 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-editorial-ink-muted hover:text-editorial-ink"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={async () => {
                    if (!cookiecloudUuid.trim() || !cookiecloudPassword.trim()) return;
                    try {
                      const res = await fetch("/api/v1/cookiecloud/config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          uuid: cookiecloudUuid,
                          password: cookiecloudPassword,
                          crypto_type: "legacy",
                        }),
                      });
                      if (!res.ok) throw new Error("请求失败");
                      toast.success("CookieCloud 配置已保存");
                    } catch {
                      toast.error("保存 CookieCloud 配置失败");
                    }
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

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <User size={15} className="text-editorial-ink-soft" />
                <h2 className="text-[16px] font-semibold text-editorial-ink">账号 Cookie</h2>
              </div>
              <p className="mt-1 text-[12px] text-editorial-ink-muted">各平台登录 Cookie 状态</p>
            </div>
            <div className="divide-y divide-editorial-hairline border-y border-editorial-hairline">
              {[
                { id: "xiaohongshu", label: "小红书", icon: Xiaohongshu },
                { id: "bilibili", label: "B站", icon: Bilibili },
                { id: "douyin", label: "抖音", icon: Douyin },
                { id: "zhihu", label: "知乎", icon: Zhihu },
              ].map((platform) => {
                const isConfigured = cookieStatus[platform.id] ?? false;
                return (
                  <div
                    key={platform.id}
                    className="group flex items-center gap-3 px-2 py-3 transition-colors hover:bg-editorial-surface-soft"
                  >
                    <platform.icon size={20} />
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-editorial-ink">
                      {platform.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums",
                        isConfigured
                          ? "bg-editorial-semantic-success/15 text-editorial-semantic-success"
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
