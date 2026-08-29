import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CircleDot,
  ExternalLink,
  Hourglass,
  Pencil,
  ShieldCheck,
  Tag,
  Tags,
} from "lucide-react";
import { Streamdown, type MathPlugin } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { loadMathPlugin } from "@/lib/math-mathjax";
import { normalizeMathMarkdown } from "@/lib/math-normalize";
import { streamdownTranslations } from "@/lib/streamdown-i18n";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { listContainerVariants, listItemVariants } from "@/lib/motion";
import { wikiTypeLabel } from "./constants";
import "streamdown/styles.css";
import "./wiki-markdown.css";

interface WikiReaderProps {
  spaceId: string;
  pageId: string;
  onEdit?: () => void;
  onNavigate: (target: string) => void;
}

export function WikiReader({ spaceId, pageId, onEdit, onNavigate }: WikiReaderProps) {
  const { t } = useTranslation();
  // 引用必须稳定，否则重渲染会击穿 Streamdown 的 memo 导致全量重解析
  const sdTranslations = useMemo(() => streamdownTranslations(t), [t]);
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([]);
  const [loading, setLoading] = useState(true);

  // math 渲染器（mathjax-full ~2MB）异步加载：wiki 页面含公式才下载，不进首屏
  const [mathPlugin, setMathPlugin] = useState<MathPlugin | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMathPlugin().then((p) => {
      if (!cancelled) setMathPlugin(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const loadIdRef = useRef(0);

  const loadPage = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const [result, links] = await Promise.all([
        getWikiPage(spaceId, pageId),
        getWikiBacklinks(spaceId, pageId),
      ]);
      if (loadId !== loadIdRef.current) return;
      setPage(result);
      setBacklinks(links);
    } catch {
      // 错误由 apiFetch toast 统一处理
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  // components 引用必须稳定，否则重渲染会击穿 Streamdown 的 memo 导致全量重解析
  // 必须置于条件 return 之前，否则 loading→loaded 时 hooks 数量变化会崩溃
  const readerComponents = useMemo(
    () => ({
      a: ({ href, children }: ComponentPropsWithoutRef<"a">) => {
        const target = href ? resolveInternalTarget(href, page?.concept_id ?? "") : null;
        if (target) {
          return (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="font-medium text-editorial-primary underline decoration-editorial-primary/30 underline-offset-4 hover:decoration-editorial-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
              onClick={() => onNavigate(target)}
            >
              {children}
            </motion.button>
          );
        }

        return (
          <motion.a
            href={href}
            target="_blank"
            rel="noreferrer"
            whileHover={{ y: -1 }}
            className="font-medium text-editorial-primary underline decoration-editorial-primary/30 underline-offset-4 hover:decoration-editorial-primary"
          >
            {children}
          </motion.a>
        );
      },
      table: MarkdownTable,
    }),
    [page?.concept_id, onNavigate],
  );

  const markdown = useMemo(
    () => (page?.content ? normalizeMathMarkdown(stripWikiFootnotes(page.content)) : ""),
    [page?.content],
  );

  if (loading) {
    return <WikiReaderSkeleton />;
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center bg-editorial-canvas">
        <p className="text-body text-editorial-ink-muted">{t("wiki.noPage")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-editorial-canvas">
      <div className="mx-auto w-full max-w-[1040px] px-5 py-5 sm:px-8 sm:py-8">
        <PageMetadataCard page={page} {...(onEdit !== undefined ? { onEdit } : {})} />

        <article className="mx-auto max-w-[760px] px-1 pb-16 pt-8 sm:px-5">
          <div className="wiki-markdown text-base leading-7 text-editorial-ink">
            <Streamdown
              mode="static"
              plugins={{ cjk, ...(mathPlugin ? { math: mathPlugin } : {}) }}
              components={readerComponents}
              translations={sdTranslations}
            >
              {markdown}
            </Streamdown>
          </div>

          {backlinks.length > 0 && (
            <section className="mt-12 border-t border-editorial-hairline pt-6">
              <h2 className="mb-3 text-sm font-semibold text-editorial-ink">
                {t("wiki.backlinksCount", { count: backlinks.length })}
              </h2>
              <AnimatePresence initial={false}>
                <motion.div
                  className="grid gap-1 sm:grid-cols-2"
                  variants={listContainerVariants}
                  initial="initial"
                  animate="animate"
                >
                  {backlinks.map((backlink) => (
                    <motion.button
                      key={backlink.page_id}
                      type="button"
                      layout
                      variants={listItemVariants}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.99 }}
                      className="group flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-editorial-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
                      onClick={() => onNavigate(backlink.page_id)}
                    >
                      <ArrowLeft size={13} className="shrink-0 text-editorial-ink-muted" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-editorial-primary">
                        {backlink.title}
                      </span>
                      <span className="truncate text-xs text-editorial-ink-muted">
                        {backlink.path}
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}

/** streamdown 不渲染 GFM 脚注（引用变无导航的 ^src 按钮、定义被丢弃），渲染前直接剥离脚注引用与定义 */
function stripWikiFootnotes(markdown: string): string {
  const cleaned = markdown.replace(/^\[(\^[\w-]+)\]:\s*.*$/gm, "");
  return cleaned.replace(/\[\^[\w-]+\]/g, "");
}

function resolveInternalTarget(href: string, currentConceptId: string): string | null {
  const [rawPath] = href.split(/[?#]/, 1);
  if (!rawPath?.toLowerCase().endsWith(".md")) return null;
  if (rawPath.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(rawPath)) return null;

  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    /* 非法编码时保留原路径，由后续的标准化逻辑处理。 */
  }

  const path = decodedPath.startsWith("/")
    ? decodedPath.slice(1)
    : `${currentConceptId.split("/").slice(0, -1).join("/")}/${decodedPath}`;
  const resolved: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  const conceptId = resolved.join("/").replace(/\.md$/i, "");
  return conceptId || null;
}

function PageMetadataCard({ page, onEdit }: { page: WikiPageRead; onEdit?: () => void }) {
  const { t, i18n } = useTranslation();
  // OKF v0.2 元数据：status/generated/sources/verified/stale_after 均为可选，缺失时不展示
  const fm = page.frontmatter ?? {};
  const status = typeof fm["status"] === "string" ? fm["status"] : "";
  const statusKey =
    status === "draft"
      ? "wiki.statusDraft"
      : status === "deprecated"
        ? "wiki.statusDeprecated"
        : "wiki.statusStable";
  const sources = Array.isArray(fm["sources"])
    ? fm["sources"]
        .map((s) =>
          typeof s === "string"
            ? { resource: s }
            : s && typeof s === "object" && !Array.isArray(s)
              ? s
              : null,
        )
        .filter(
          (s): s is Record<string, unknown> => s !== null && typeof s["resource"] === "string",
        )
    : [];
  const verifiedRaw =
    fm["verified"] == null ? [] : Array.isArray(fm["verified"]) ? fm["verified"] : [fm["verified"]];
  const verified = verifiedRaw
    .filter(
      (v): v is Record<string, unknown> =>
        v !== null && typeof v === "object" && typeof v["by"] === "string",
    )
    .map((v) => v["by"] as string);
  const staleAfter = typeof fm["stale_after"] === "string" ? fm["stale_after"] : "";
  return (
    <section className="mx-auto max-w-[760px] rounded-xl border border-editorial-hairline-strong bg-editorial-surface-card px-4 pb-5 pt-3 shadow-md sm:px-5 sm:pb-5 sm:pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs text-editorial-ink-muted">{page.path}</span>
          </div>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-[-0.025em] text-editorial-ink sm:text-2xl">
            {page.title}
          </h1>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-editorial-ink-muted">
            <CalendarClock size={13} />
            <span>
              {t("wiki.updatedAt", { date: formatUpdatedAt(page.timestamp, i18n.language) })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs text-editorial-ink hover:bg-editorial-surface-soft"
                onClick={onEdit}
              >
                <Pencil size={13} />
                {t("common.edit")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-editorial-hairline pt-4">
        <div className="space-y-3">
          <MetadataRow icon={<Tag size={13} />} label={t("wiki.type")}>
            <span className="rounded-md bg-editorial-surface-soft px-2 py-1 text-xs text-editorial-ink-soft">
              {wikiTypeLabel(page.type, i18n.language)}
            </span>
          </MetadataRow>

          {status && (
            <MetadataRow icon={<CircleDot size={13} />} label={t("wiki.status")}>
              <span className="text-xs text-editorial-ink-soft">{t(statusKey)}</span>
            </MetadataRow>
          )}

          {sources.length > 0 && (
            <MetadataRow icon={<BookOpen size={13} />} label={t("wiki.sourcesField")}>
              {sources.map((s) => (
                <span
                  key={String(s["resource"])}
                  className="rounded-md bg-editorial-surface-soft px-2 py-1 text-xs text-editorial-ink-soft"
                >
                  {String(s["resource"])}
                </span>
              ))}
            </MetadataRow>
          )}

          {verified.length > 0 && (
            <MetadataRow icon={<ShieldCheck size={13} />} label={t("wiki.verifiedBy")}>
              <span className="text-xs text-editorial-ink-soft">{verified.join("、")}</span>
            </MetadataRow>
          )}

          {staleAfter && (
            <MetadataRow icon={<Hourglass size={13} />} label={t("wiki.staleAfter")}>
              <span className="text-xs text-editorial-ink-soft">
                {formatDateOnly(staleAfter, i18n.language)}
              </span>
            </MetadataRow>
          )}

          {page.tags.length > 0 && (
            <MetadataRow icon={<Tags size={13} />} label={t("wiki.tags")}>
              {page.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-editorial-surface-soft px-2 py-1 text-xs text-editorial-ink-soft"
                >
                  #{tag}
                </span>
              ))}
            </MetadataRow>
          )}

          {page.description && (
            <p className="text-body leading-6 text-editorial-ink-soft">{page.description}</p>
          )}

          {page.resource && (
            <MetadataRow icon={<ExternalLink size={13} />} label={t("wiki.resource")}>
              <a
                href={page.resource}
                target="_blank"
                rel="noreferrer"
                className="max-w-full truncate text-xs text-editorial-primary underline underline-offset-2"
              >
                {page.resource}
              </a>
            </MetadataRow>
          )}
        </div>
      </div>
    </section>
  );
}

function MetadataRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-editorial-ink-muted">
      <span className="mt-1 shrink-0">{icon}</span>
      <span className="w-[54px] shrink-0 pt-0.5 text-xs">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MarkdownTable({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return (
    <div className="my-6 max-w-full overflow-x-auto rounded-lg border border-editorial-hairline">
      <table {...props}>{children}</table>
    </div>
  );
}

function WikiReaderSkeleton() {
  return (
    <div className="h-full overflow-y-auto bg-editorial-canvas p-5 sm:p-8">
      <div className="mx-auto max-w-[1040px] px-5 py-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-9 w-56" />
        <Skeleton className="mt-6 h-12 w-full" />
      </div>
      <div className="mx-auto mt-10 max-w-[720px] space-y-4 px-5">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
    </div>
  );
}

function formatUpdatedAt(value: string, locale = "zh-CN") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value: string, locale = "zh-CN") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
