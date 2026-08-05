"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import {
  Plus,
  Trash2,
  Rss,
  Globe,
  Cookie,
  User,
  Eye,
  EyeOff,
  RefreshCw,
  CircleHelp,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { listContainerVariants, listItemVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  Xiaohongshu,
  Douyin,
  Bilibili,
  Zhihu,
  Weread,
} from "@/components/icons/remote-connection-icons";
import { CookieCloudGuideDialog } from "@/components/ui/cookiecloud-guide-dialog";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
});

// ─── 社交媒体收藏配置 ──────────────────────────────────────────

interface SocialOption {
  id: string;
  labelKey: string;
  route: string;
  /** 输入模式：需要手动输入 ID */
  paramKey?: string;
  placeholderKey?: string;
  /** 下拉模式：从 API 加载选项列表供选择 */
  select?: boolean;
  /** 下拉选项的值对应的 params key（如 fid / id / mp_id） */
  idParam?: string;
  /** 选项列表 API */
  listApi?: string;
  /** 下拉含"全部"选项（如微信读书全部书架） */
  hasAll?: boolean;
  allLabelKey?: string;
}

const SOCIAL_OPTIONS: SocialOption[] = [
  {
    id: "xiaohongshu",
    labelKey: "feeds.platformXiaohongshu",
    route: "xhs/user/collect",
    paramKey: "user_id",
    placeholderKey: "feeds.socialIdXiaohongshu",
  },
  {
    id: "bilibili",
    labelKey: "feeds.platformBilibili",
    route: "bili/user/fav",
    select: true,
    idParam: "fid",
    listApi: "/api/v1/crawler/bili/favs",
  },
  {
    id: "zhihu",
    labelKey: "feeds.platformZhihu",
    route: "zh/collection",
    select: true,
    idParam: "id",
    listApi: "/api/v1/crawler/zh/collections",
  },
  {
    id: "weread",
    labelKey: "feeds.platformWeread",
    route: "weread/shelf",
    select: true,
    idParam: "mp_id",
    listApi: "/api/v1/crawler/weread/mps",
    hasAll: true,
    allLabelKey: "feeds.wereadAllShelf",
  },
];

// ─── 平台图标 ────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  bilibili: Bilibili,
  douyin: Douyin,
  xiaohongshu: Xiaohongshu,
  zhihu: Zhihu,
  weread: Weread,
};

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: "feeds.platformBilibili",
  douyin: "feeds.platformDouyin",
  xiaohongshu: "feeds.platformXiaohongshu",
  zhihu: "feeds.platformZhihu",
  weread: "feeds.platformWeread",
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
  const [addTab, setAddTab] = useState<"rss" | "social">("rss");
  const [rssUrl, setRssUrl] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("xiaohongshu");
  const [socialId, setSocialId] = useState("");
  const [listOptions, setListOptions] = useState<{ name: string; id: string }[]>([]);
  const [selectedOption, setSelectedOption] = useState("");
  // 各平台收藏夹/公众号列表缓存（切换平台时避免重复请求启动浏览器）
  const optionsCache = useRef<Map<string, { name: string; id: string }[]>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RssSource | null>(null);

  // CookieCloud
  const [cookiecloudUuid, setCookiecloudUuid] = useState("");
  const [cookiecloudPassword, setCookiecloudPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [cookieStatus, setCookieStatus] = useState<Record<string, boolean>>({
    xiaohongshu: false,
    bilibili: false,
    douyin: false,
    zhihu: false,
    weread: false,
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
    void loadSources();
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
          weread: false,
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
        const list: { uuid: string; hasData?: boolean; password?: string }[] = data?.data ?? [];
        if (list.length === 0) return;
        // 配置以数据库为准：优先取已有同步数据的配置（扩展实际使用的 UUID），否则第一行
        const withData = list.filter((r) => r.hasData);
        const selected = withData[0] ?? list[0];
        setCookiecloudUuid(selected.uuid);
        // 回填已保存的密码，配合眼睛切换显示真实密码
        if (selected.password) setCookiecloudPassword(selected.password);
        setIsConfigured(true);
      })
      .catch(() => {});
  }, []);

  // 下拉模式平台（B站/知乎/微信读书）选中时加载收藏夹/公众号列表（带缓存）
  useEffect(() => {
    const opt = SOCIAL_OPTIONS.find((o) => o.id === socialPlatform);
    if (!opt?.select || !opt.listApi) return;
    let cancelled = false;
    const cached = optionsCache.current.get(opt.id);
    if (cached) {
      setListOptions(cached);
      return;
    }
    fetch(opt.listApi)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = data?.data ?? [];
        const normalized = Array.isArray(list) ? list : [];
        optionsCache.current.set(opt.id, normalized);
        setListOptions(normalized);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [socialPlatform]);

  const handleAddRss = async () => {
    const url = rssUrl.trim();
    if (!url) return;

    try {
      await addSource({ type: "rss", url });
      setRssUrl("");
      await loadSources();
      toast.add({ title: t("feeds.addSuccess"), type: "success" });
    } catch {
      toast.add({ title: t("feeds.addError"), type: "error" });
    }
  };

  const handleAddSocial = async () => {
    const opt = SOCIAL_OPTIONS.find((o) => o.id === socialPlatform);
    if (!opt) return;
    // 下拉平台（无"全部"选项）必须选择；输入平台必须输入
    if (opt.select) {
      if (!opt.hasAll && !selectedOption.trim()) return;
    } else if (!socialId.trim()) {
      return;
    }

    const params: Record<string, unknown> = opt.select
      ? opt.hasAll
        ? selectedOption
          ? { [opt.idParam!]: selectedOption }
          : {}
        : { [opt.idParam!]: selectedOption }
      : { [opt.paramKey!]: socialId.trim() };

    try {
      await addSource({
        type: "social",
        platform: opt.id,
        route: opt.route,
        url: "",
        params,
      });
      setSocialId("");
      setSelectedOption("");
      await loadSources();
      toast.add({ title: t("feeds.addSuccess"), type: "success" });
    } catch {
      toast.add({ title: t("feeds.addError"), type: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeSource(id);
      await loadSources();
      setDeleteTarget(null);
      toast.add({ title: t("feeds.deleteSuccess"), type: "success" });
    } catch {
      toast.add({ title: t("feeds.deleteError"), type: "error" });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAllFeeds();
      toast.add({ title: t("feeds.syncSuccess"), type: "success" });
    } catch {
      toast.add({ title: t("feeds.syncError"), type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveCookieConfig = async () => {
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
      setIsConfigured(true);
      toast.add({ title: t("feeds.configSaved"), type: "success" });
    } catch {
      toast.add({ title: t("feeds.configSaveFailed"), type: "error" });
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
                onClick={() => void handleSync()}
                disabled={syncing}
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
              >
                {syncing ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
                {t("feeds.sync")}
              </Button>
            </div>

            {/* 添加区：RSS / 社交媒体 双入口 */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-1 rounded-lg bg-editorial-surface-soft p-1">
                <button
                  type="button"
                  onClick={() => setAddTab("rss")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                    addTab === "rss"
                      ? "bg-editorial-surface-card text-editorial-ink shadow-sm"
                      : "text-editorial-ink-muted hover:text-editorial-ink",
                  )}
                >
                  <Rss size={13} />
                  {t("feeds.addRssTab")}
                </button>
                <button
                  type="button"
                  onClick={() => setAddTab("social")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                    addTab === "social"
                      ? "bg-editorial-surface-card text-editorial-ink shadow-sm"
                      : "text-editorial-ink-muted hover:text-editorial-ink",
                  )}
                >
                  <Globe size={13} />
                  {t("feeds.addSocialTab")}
                </button>
              </div>

              {addTab === "rss" ? (
                <div className="flex items-center gap-2">
                  <input
                    value={rssUrl}
                    onChange={(e) => setRssUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddRss();
                    }}
                    placeholder={t("feeds.rssUrlPlaceholder")}
                    className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                  />
                  <Button
                    onClick={() => void handleAddRss()}
                    disabled={!rssUrl.trim()}
                    size="sm"
                    className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-[12px]"
                  >
                    <Plus size={14} />
                    {t("feeds.add")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {SOCIAL_OPTIONS.map((opt) => {
                      const Icon = PLATFORM_ICONS[opt.id] ?? Globe;
                      const active = socialPlatform === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSocialPlatform(opt.id)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                            active
                              ? "border-editorial-accent bg-editorial-accent/10 text-editorial-accent"
                              : "border-editorial-hairline-strong text-editorial-ink-muted hover:text-editorial-ink",
                          )}
                        >
                          <Icon size={13} />
                          {t(opt.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const opt = SOCIAL_OPTIONS.find((o) => o.id === socialPlatform);
                    if (!opt) return null;
                    if (opt.select) {
                      // 下拉选择：B站/知乎收藏夹、微信读书公众号（后者含"全部书架"）
                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedOption}
                              onChange={(e) => setSelectedOption(e.target.value)}
                              className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
                            >
                              {opt.hasAll && (
                                <option value="">
                                  {t(opt.allLabelKey ?? "feeds.wereadAllShelf")}
                                </option>
                              )}
                              {listOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              onClick={() => void handleAddSocial()}
                              disabled={!opt.hasAll && !selectedOption.trim()}
                              size="sm"
                              className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-[12px]"
                            >
                              <Plus size={14} />
                              {t("feeds.add")}
                            </Button>
                          </div>
                          {listOptions.length === 0 && (
                            <p className="text-[12px] text-editorial-ink-muted">
                              {t("feeds.socialNoOptions")}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <input
                          value={socialId}
                          onChange={(e) => setSocialId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAddSocial();
                          }}
                          placeholder={t(opt.placeholderKey ?? "feeds.socialIdPlaceholder")}
                          className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                        />
                        <Button
                          onClick={() => void handleAddSocial()}
                          disabled={!socialId.trim()}
                          size="sm"
                          className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-[12px]"
                        >
                          <Plus size={14} />
                          {t("feeds.add")}
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 列表 */}
            {sources.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-editorial-hairline-strong bg-editorial-surface-card px-4 py-10 text-center">
                <Globe size={22} className="mb-2 text-editorial-ink-muted" />
                <p className="text-[13px] text-editorial-ink-muted">{t("feeds.noSubscriptions")}</p>
              </div>
            ) : (
              <motion.div
                className="divide-y divide-editorial-hairline border-y border-editorial-hairline"
                variants={listContainerVariants}
                initial="initial"
                animate="animate"
              >
                {sources.map((source) => {
                  const Icon =
                    source.type === "social" && source.platform
                      ? (PLATFORM_ICONS[source.platform] ?? Globe)
                      : Rss;
                  return (
                    <motion.div
                      key={source.id}
                      layout
                      variants={listItemVariants}
                      className="group flex items-center gap-3 px-2 py-3 hover:bg-editorial-surface-soft"
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
                          {source.type === "social" ? (source.route ?? source.url) : source.url}
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
                      <motion.button
                        type="button"
                        onClick={() => setDeleteTarget(source)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={13} />
                      </motion.button>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="my-6 w-px shrink-0 bg-editorial-hairline shadow-[-1px_0_2px_rgba(0,0,0,0.03)] max-sm:hidden" />

        {/* 右：Cookie 管理 */}
        <div className="flex w-96 shrink-0 flex-col gap-6 p-6 pl-8 max-lg:w-72 max-sm:w-full max-sm:p-4 max-sm:pl-4">
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Cookie size={15} className="text-editorial-ink-soft" />
                <h2 className="text-[16px] font-semibold text-editorial-ink">CookieCloud</h2>
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-editorial-accent transition-colors hover:bg-editorial-accent/10 hover:text-editorial-accent-strong"
                >
                  <CircleHelp size={13} />
                  {t("feeds.cookieCloudGuide")}
                </button>
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
                    placeholder={t("feeds.cookieUuidPlaceholder")}
                    className="w-full rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
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
                      placeholder={!showPassword && isConfigured ? "******" : ""}
                      className="w-full rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-9 text-[13px] text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-editorial-ink-muted transition-colors hover:text-editorial-ink"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={() => void handleSaveCookieConfig()}
                  disabled={!cookiecloudUuid.trim() || !cookiecloudPassword.trim()}
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
                >
                  {t("feeds.saveConfig")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <User size={15} className="text-editorial-ink-soft" />
                <h2 className="text-[16px] font-semibold text-editorial-ink">
                  {t("feeds.accountCookie")}
                </h2>
              </div>
              <p className="mt-1 text-[12px] text-editorial-ink-muted">
                {t("feeds.accountCookieDesc")}
              </p>
            </div>
            <motion.div
              className="divide-y divide-editorial-hairline border-y border-editorial-hairline"
              variants={listContainerVariants}
              initial="initial"
              animate="animate"
            >
              {[
                { id: "xiaohongshu", label: "小红书", icon: Xiaohongshu },
                { id: "bilibili", label: "B站", icon: Bilibili },
                { id: "douyin", label: "抖音", icon: Douyin },
                { id: "zhihu", label: "知乎", icon: Zhihu },
                { id: "weread", label: "微信公众号", icon: Weread },
              ].map((platform) => {
                const isConfigured = cookieStatus[platform.id] ?? false;
                return (
                  <motion.div
                    key={platform.id}
                    layout
                    variants={listItemVariants}
                    className="group flex items-center gap-3 px-2 py-3 hover:bg-editorial-surface-soft"
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
                      {isConfigured ? t("feeds.configured") : t("feeds.notConfigured")}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </div>

      <CookieCloudGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />

      <DeleteConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget.id);
        }}
        title={t("feeds.deleteSource")}
        description={
          deleteTarget ? t("feeds.deleteSourceConfirm", { name: deleteTarget.title }) : undefined
        }
      />
    </LayoutWrapper>
  );
}
