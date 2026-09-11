import { useState, useEffect, useMemo } from "react";
import { m } from "motion/react";
import {
  Plus,
  Trash2,
  Rss,
  Globe,
  User,
  Cookie,
  RefreshCw,
  AlertCircle,
  CircleHelp,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutWrapper } from "@/app/shell/layout-wrapper";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { CookieCloudGuideDialog } from "@/components/ui/cookie-cloud-guide-dialog";
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
import {
  useRssSources,
  useAddRssSource,
  useRemoveRssSource,
  useCookies,
  useCheckPlatformCookie,
  useCrawlerOptions,
  checkCookieMutationKey,
  usePendingMutationVariables,
  feedOptions,
} from "@/lib/hooks/use-feeds";
import { getCookieCloudConfig, saveCookieCloudConfig } from "@/lib/api/sources";
import type { RssSource } from "@/lib/api/sources";

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

/** Cookie 有效状态：未配置 / 已配置未校验 / 有效 / 已失效 */
type CookieState = "unconfigured" | "unknown" | "valid" | "expired";

const DEFAULT_COOKIE_STATUS: Record<string, CookieState> = {
  xiaohongshu: "unconfigured",
  bilibili: "unconfigured",
  douyin: "unconfigured",
  zhihu: "unconfigured",
  weread: "unconfigured",
};

const COOKIE_STATE_STYLES: Record<CookieState, string> = {
  valid: "bg-editorial-semantic-success/15 text-editorial-semantic-success",
  expired: "bg-editorial-semantic-error/15 text-editorial-semantic-error",
  unknown: "bg-editorial-surface-strong text-editorial-ink-muted",
  unconfigured: "bg-editorial-surface-strong text-editorial-ink-muted",
};

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

// ─── API（由 use-feeds hooks 统一管理） ────────────────────────
export function SourcesPage() {
  const { t } = useTranslation();

  const { data: sources = [] } = useRssSources();
  const addSourceMutation = useAddRssSource();
  const removeSourceMutation = useRemoveRssSource();
  const { data: cookieRows = [] } = useCookies();
  const checkCookieMutation = useCheckPlatformCookie();

  // CookieCloud 扩展配置：UUID + 密码（保存后扩展推送的加密数据可解密入库）
  // UUID 持久化到 localStorage 回填（随机标识符，非凭证）；密码不落前端存储——
  // 服务端 AES 加密保存（OWASP：凭证类敏感数据不得明文存客户端存储，XSS 可读）
  const [cookiecloudUuid, setCookiecloudUuid] = useState(() => {
    try {
      return localStorage.getItem("feedmind.cookiecloud.uuid") ?? "";
    } catch {
      return "";
    }
  });
  const [cookiecloudPassword, setCookiecloudPassword] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);

  // 已配置状态：UUID 有值时静默校验服务端是否存在该配置，用于密码框占位提示
  const [cloudConfigured, setCloudConfigured] = useState(false);
  useEffect(() => {
    if (!cookiecloudUuid.trim()) {
      setCloudConfigured(false);
      return;
    }
    let cancelled = false;
    getCookieCloudConfig(cookiecloudUuid.trim())
      .then(() => {
        if (!cancelled) setCloudConfigured(true);
      })
      .catch(() => {
        // 404 等视为未配置，不打扰用户
        if (!cancelled) setCloudConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cookiecloudUuid]);

  const handleSaveCookieCloud = async () => {
    if (!cookiecloudUuid.trim() || !cookiecloudPassword.trim()) return;
    setSavingCloud(true);
    try {
      await saveCookieCloudConfig(cookiecloudUuid.trim(), cookiecloudPassword);
      try {
        localStorage.setItem("feedmind.cookiecloud.uuid", cookiecloudUuid.trim());
        // 密码只提交服务端，不落 localStorage（明文副本无必要）
      } catch {
        // localStorage 不可用（隐私模式等）不影响保存本身
      }
      setCloudConfigured(true);
      toast.add({ title: t("feeds.cookieCloudSaved"), type: "success" });
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
    } finally {
      setSavingCloud(false);
    }
  };

  const [addTab, setAddTab] = useState<"rss" | "social">("rss");
  const [rssUrl, setRssUrl] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("xiaohongshu");
  const [socialId, setSocialId] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RssSource | null>(null);

  // Cookie 管理：状态完全由服务端 cookie_store 派生（不设前端覆盖层）——
  // 校验/同步/下拉的结果后端都会落库（成功回写有效、鉴权失败写失效），前端失效只需重新拉取；
  // 覆盖层会随离开页面而丢失，导致状态在导航往返间"重置"
  const queryClient = useQueryClient();

  // 下拉模式平台的收藏夹/公众号列表（react-query 按 listApi 缓存，切换平台不重复请求）
  const activeOption = SOCIAL_OPTIONS.find((o) => o.id === socialPlatform);
  const crawlerQuery = useCrawlerOptions(activeOption?.select ? activeOption.listApi : undefined);
  const listOptions = crawlerQuery.data ?? [];
  const listLoading = crawlerQuery.isPending;
  const listError = crawlerQuery.error ? crawlerQuery.error.message : null;
  // 校验进行中从 MutationCache 派生（非本地 state）：单平台/批量校验都需驱动爬虫、耗时长，
  // 导航往返后反馈不丢失。恰一个 pending 视为单平台校验（对应行 spinner），
  // ≥2 即批量校验（全局按钮统一反馈，避免单槽位 variables 闪现错误平台）
  const pendingCheckPlatforms = usePendingMutationVariables<string>(checkCookieMutationKey);
  const checkingPlatform = pendingCheckPlatforms.length === 1 ? pendingCheckPlatforms[0]! : null;
  const checkingAll = pendingCheckPlatforms.length > 1;

  // 状态：每平台取 checkedAt 最新一行的 valid（服务器记录，探活/同步/推送时更新）
  const cookieStatus = useMemo(() => {
    const status: Record<string, CookieState> = { ...DEFAULT_COOKIE_STATUS };
    if (cookieRows.length === 0) return status;
    const latest = new Map<string, { valid: boolean | null; checkedAt: string | null }>();
    for (const row of cookieRows) {
      if (!(row.platform in status)) continue;
      const prev = latest.get(row.platform);
      if (!prev || (row.checkedAt ?? "") > (prev.checkedAt ?? "")) {
        latest.set(row.platform, { valid: row.valid, checkedAt: row.checkedAt });
      }
    }
    for (const [platform, r] of latest) {
      status[platform] = r.valid == null ? "unknown" : r.valid ? "valid" : "expired";
    }
    return status;
  }, [cookieRows]);

  // 爬虫下拉加载失败（多为登录失效）联动刷新 Cookie 状态：后端已落库失效标记，
  // 这里只需拉取最新记录让面板反映出来；手动输入平台（无下拉列表）不受影响
  useEffect(() => {
    const err = crawlerQuery.error as (Error & { status?: number }) | null;
    if (activeOption?.select && err?.status === 401) {
      void queryClient.invalidateQueries({ queryKey: feedOptions.cookies().queryKey });
    }
  }, [crawlerQuery.error, socialPlatform, activeOption, queryClient]);

  const handleAddRss = async () => {
    const url = rssUrl.trim();
    if (!url) return;

    try {
      await addSourceMutation.mutateAsync({ type: "rss", url });
      setRssUrl("");
      toast.add({ title: t("feeds.addSuccess"), type: "success" });
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
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

    // 来源标题：下拉用收藏夹/公众号名称；"全部书架"与输入平台用平台名兜底
    const selectedName = listOptions.find((o) => o.id === selectedOption)?.name;
    const title = opt.select
      ? opt.hasAll
        ? selectedOption
          ? selectedName
          : t("feeds.wereadAllShelf")
        : selectedName
      : `${t(opt.labelKey)} - ${socialId.trim()}`;

    try {
      await addSourceMutation.mutateAsync({
        type: "social",
        platform: opt.id,
        route: opt.route,
        url: "",
        params,
        title,
      });
      setSocialId("");
      setSelectedOption("");
      toast.add({ title: t("feeds.addSuccess"), type: "success" });
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeSourceMutation.mutateAsync(id);
      setDeleteTarget(null);
      toast.add({ title: t("feeds.deleteSuccess"), type: "success" });
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
    }
  };

  // 校验指定平台 Cookie 有效性（刷新按钮）：后端落库，拉取最新记录刷新面板状态
  const handleCheckCookie = async (platformId: string) => {
    if (checkingPlatform || checkingAll) return;
    try {
      const result = await checkCookieMutation.mutateAsync(platformId);
      if (result.supported === false) {
        // 未配置与不支持校验都返回 supported=false，按当前状态区分文案
        toast.add({
          title:
            cookieStatus[platformId] === "unconfigured"
              ? t("feeds.cookieNotConfigured")
              : t("feeds.cookieCheckNotSupported"),
          type: "info",
        });
      } else if (result) {
        const next: CookieState =
          result.valid == null ? "unknown" : result.valid ? "valid" : "expired";
        void queryClient.invalidateQueries({ queryKey: feedOptions.cookies().queryKey });
        toast.add({
          title:
            next === "expired"
              ? t("feeds.cookieExpiredHint")
              : next === "valid"
                ? t("feeds.cookieValidHint")
                : t("feeds.cookieUnknown"),
          type: next === "expired" ? "error" : next === "valid" ? "success" : "info",
        });
        // 下拉列表曾因登录失效加载失败：校验通过后重取当前平台列表，让错误 banner 消失
        if (next === "valid" && activeOption?.select) {
          void crawlerQuery.refetch();
        }
      }
    } catch {
      // apiFetch 已 toast 错误，避免重复提示
    }
  };

  // 应用内浏览器登录已移除：Cookie 由 CookieCloud 扩展 / 手动粘贴维护，平台行按钮改为单平台校验（handleCheckCookie）

  // 批量校验所有平台 Cookie 有效性（账号 Cookie 标题右侧通用按钮）；
  // 进行中反馈由 pendingCheckPlatforms 派生，结果后端落库后统一拉取刷新
  const handleCheckAllCookies = async () => {
    if (checkingAll) return;
    const platforms = Object.keys(DEFAULT_COOKIE_STATUS);
    await Promise.all(
      // 单个平台失败（网络波动等）不阻断其余平台；apiFetch 已 toast 错误
      platforms.map((p) => checkCookieMutation.mutateAsync(p).catch(() => undefined)),
    );
    void queryClient.invalidateQueries({ queryKey: feedOptions.cookies().queryKey });
    toast.add({ title: t("feeds.cookieRefreshDone"), type: "success" });
  };

  return (
    <LayoutWrapper title={t("feeds.sourceManagement")}>
      <div className="flex h-full min-w-0 overflow-y-auto max-sm:flex-col">
        <div className="flex min-w-0 flex-1 gap-5 p-6 max-sm:flex-col max-sm:p-4">
          {/* 左：订阅列表 */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-editorial-ink-soft">{t("feeds.pasteLinkHint")}</p>
              </div>
            </div>

            {/* 添加区：RSS / 社交媒体 双入口 */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-1 rounded-lg bg-editorial-surface-soft p-1">
                <button
                  type="button"
                  onClick={() => setAddTab("rss")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
                      // isComposing：拼音候选确认的回车不触发提交（IME 组合输入守卫）
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleAddRss();
                    }}
                    placeholder={t("feeds.rssUrlPlaceholder")}
                    className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-body text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                  />
                  <Button
                    onClick={() => void handleAddRss()}
                    disabled={!rssUrl.trim()}
                    size="sm"
                    className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-xs"
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
                          onClick={() => {
                            setSocialPlatform(opt.id);
                            // 切换平台时清空已选下拉项，避免用上一平台的 id 添加错误配置的源
                            setSelectedOption("");
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
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
                              aria-label={t(opt.labelKey)}
                              className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-body text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft"
                            >
                              {opt.hasAll ? (
                                <option value="">
                                  {t(opt.allLabelKey ?? "feeds.wereadAllShelf")}
                                </option>
                              ) : (
                                // 非"全部"平台加占位项，避免浏览器默认高亮第一个却选中态为空导致无法添加
                                <option value="" disabled>
                                  {t("feeds.selectPlaceholder")}
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
                              className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
                            >
                              <Plus size={14} />
                              {t("feeds.add")}
                            </Button>
                          </div>
                          {listError ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-editorial-semantic-error/20 bg-editorial-semantic-error/5 px-3 py-2">
                              <span className="flex items-center gap-1.5 text-xs text-editorial-semantic-error">
                                <AlertCircle size={13} className="shrink-0" />
                                {t("feeds.cookieListExpired")}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleCheckCookie(opt.id)}
                                disabled={checkingPlatform === opt.id || checkingAll}
                                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-editorial-ink-muted transition-colors hover:text-editorial-ink disabled:opacity-50"
                              >
                                {checkingPlatform === opt.id ? (
                                  <MotionSpinner size={12} />
                                ) : (
                                  <RefreshCw size={12} />
                                )}
                                {t("feeds.cookieRefresh")}
                              </button>
                            </div>
                          ) : listLoading ? (
                            <p className="flex items-center gap-1.5 text-xs text-editorial-ink-muted">
                              <MotionSpinner size={12} />
                              {t("feeds.loading")}
                            </p>
                          ) : listOptions.length === 0 ? (
                            <p className="text-xs text-editorial-ink-muted">
                              {t("feeds.socialNoOptions")}
                            </p>
                          ) : null}
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <input
                          value={socialId}
                          onChange={(e) => setSocialId(e.target.value)}
                          onKeyDown={(e) => {
                            // isComposing：拼音候选确认的回车不触发提交（IME 组合输入守卫）
                            if (e.key === "Enter" && !e.nativeEvent.isComposing)
                              void handleAddSocial();
                          }}
                          placeholder={t(opt.placeholderKey ?? "feeds.socialIdPlaceholder")}
                          className="min-w-0 flex-1 rounded-md border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-body text-editorial-ink outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent-soft placeholder:text-editorial-ink-muted"
                        />
                        <Button
                          onClick={() => void handleAddSocial()}
                          disabled={!socialId.trim()}
                          size="sm"
                          className="h-8 gap-1.5 shrink-0 rounded-lg px-3 text-xs"
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
                <p className="text-body text-editorial-ink-muted">{t("feeds.noSubscriptions")}</p>
              </div>
            ) : (
              <m.div
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
                    <m.div
                      key={source.id}
                      layout
                      variants={listItemVariants}
                      className="group flex items-center gap-3 px-2 py-3 hover:bg-editorial-surface-soft"
                    >
                      <Icon size={20} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-body font-medium text-editorial-ink truncate">
                            {source.title}
                          </span>
                          {source.type === "social" && source.platform && (
                            <span className="shrink-0 rounded bg-editorial-surface-strong px-1.5 py-0.5 text-xs text-editorial-ink-muted">
                              {t(PLATFORM_LABELS[source.platform] ?? source.platform)}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-editorial-ink-muted">
                          {source.type === "social" ? (source.route ?? source.url) : source.url}
                          {source.lastSyncedAt && (
                            <>
                              {" "}
                              ·{" "}
                              {t("feeds.syncedAt", {
                                time: new Date(source.lastSyncedAt).toLocaleString(),
                              })}
                            </>
                          )}
                        </p>
                      </div>
                      <m.button
                        type="button"
                        onClick={() => setDeleteTarget(source)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={13} />
                      </m.button>
                    </m.div>
                  );
                })}
              </m.div>
            )}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="my-6 w-px shrink-0 bg-editorial-hairline shadow-[-1px_0_2px_rgba(0,0,0,0.03)] max-sm:hidden" />

        {/* 右：Cookie 管理 */}
        <div className="flex w-96 shrink-0 flex-col gap-6 p-6 pl-8 max-lg:w-72 max-sm:w-full max-sm:p-4 max-sm:pl-4">
          {/* CookieCloud 扩展配置 */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Cookie size={15} className="text-editorial-ink-soft" />
                  <h2 className="text-base font-semibold text-editorial-ink">CookieCloud</h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGuideOpen(true)}
                  className="h-7 gap-1 px-2 text-xs font-medium text-editorial-accent"
                >
                  <CircleHelp size={14} />
                  {t("feeds.cookieCloudGuide")}
                </Button>
              </div>
              <p className="mt-1 text-xs text-editorial-ink-muted">{t("feeds.cookieCloudDesc")}</p>
            </div>
            <div className="rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 transition-[border-color,box-shadow] duration-150 ease-out hover:border-editorial-hairline-strong hover:shadow-sm">
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="cookiecloud-uuid"
                    className="mb-1 block text-xs font-medium text-editorial-ink-muted"
                  >
                    {t("feeds.cookieUuidLabel")}
                  </label>
                  <input
                    id="cookiecloud-uuid"
                    value={cookiecloudUuid}
                    onChange={(e) => setCookiecloudUuid(e.target.value)}
                    placeholder={t("feeds.cookieUuidPlaceholder")}
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-body text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cookiecloud-password"
                    className="mb-1 block text-xs font-medium text-editorial-ink-muted"
                  >
                    {t("feeds.cookiePasswordLabel")}
                  </label>
                  <input
                    id="cookiecloud-password"
                    type="password"
                    value={cookiecloudPassword}
                    onChange={(e) => setCookiecloudPassword(e.target.value)}
                    placeholder={
                      cloudConfigured
                        ? t("feeds.cookiePasswordSavedPlaceholder")
                        : t("feeds.cookiePasswordPlaceholder")
                    }
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-soft px-3 py-2 text-body text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
                  />
                </div>
                <Button
                  onClick={() => void handleSaveCookieCloud()}
                  disabled={!cookiecloudUuid.trim() || !cookiecloudPassword.trim() || savingCloud}
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                >
                  {savingCloud ? <MotionSpinner size={14} /> : <Cookie size={14} />}
                  {t("feeds.cookieSaveConfig")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <User size={15} className="text-editorial-ink-soft" />
                  <h2 className="text-base font-semibold text-editorial-ink">
                    {t("feeds.accountCookie")}
                  </h2>
                </div>
                <Button
                  onClick={() => void handleCheckAllCookies()}
                  disabled={checkingAll}
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                >
                  {checkingAll ? <MotionSpinner size={14} /> : <RefreshCw size={14} />}
                  {t("feeds.cookieRefresh")}
                </Button>
              </div>
              <p className="mt-1 text-xs text-editorial-ink-muted">
                {t("feeds.accountCookieDesc")}
              </p>
            </div>
            <m.div
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
                const state = cookieStatus[platform.id] ?? "unconfigured";
                const stateLabel =
                  state === "valid"
                    ? t("feeds.cookieEffective")
                    : state === "expired"
                      ? t("feeds.cookieExpired")
                      : state === "unknown"
                        ? t("feeds.cookieUnknown")
                        : t("feeds.notConfigured");
                return (
                  <m.div
                    key={platform.id}
                    layout
                    variants={listItemVariants}
                    className="group flex items-center gap-3 px-2 py-3 hover:bg-editorial-surface-soft"
                  >
                    <platform.icon size={20} />
                    <span className="min-w-0 flex-1 text-body font-medium text-editorial-ink">
                      {platform.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                        COOKIE_STATE_STYLES[state],
                      )}
                    >
                      {stateLabel}
                    </span>
                    <Button
                      onClick={() => void handleCheckCookie(platform.id)}
                      disabled={state === "valid" || checkingPlatform !== null}
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                    >
                      {checkingPlatform === platform.id ? (
                        <MotionSpinner size={12} />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      {t("feeds.cookieCheck")}
                    </Button>
                  </m.div>
                );
              })}
            </m.div>
          </div>
        </div>
      </div>

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
      <CookieCloudGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </LayoutWrapper>
  );
}
