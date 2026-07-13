"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { ArrowLeft, CalendarClock, FileText, Link2, Pencil, Tags } from "lucide-react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import type { WikiBacklink, WikiPageRead } from "@feedmind/contracts";
import { getWikiBacklinks, getWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lightweightCode } from "@/components/ai-elements/code-plugin";
import { WIKI_TYPE_COLORS, WIKI_TYPE_LABELS } from "./constants";
import { useTranslation } from "react-i18next";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import "./wiki-markdown.css";

interface WikiReaderProps {
  spaceId: string;
  pageId: string;
  onEdit?: () => void;
  onNavigate: (target: string) => void;
}

const TYPE_COLORS = WIKI_TYPE_COLORS;

export function WikiReader({ spaceId, pageId, onEdit, onNavigate }: WikiReaderProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [backlinks, setBacklinks] = useState<WikiBacklink[]>([]);
  const [loading, setLoading] = useState(true);
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
    loadPage();
  }, [loadPage]);

  if (loading) {
    return <WikiReaderSkeleton />;
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center bg-editorial-canvas">
        <p className="text-[13px] text-editorial-ink-muted">{t("wiki.noPage")}</p>
      </div>
    );
  }

  const typeColor = TYPE_COLORS[page.type] || "var(--color-editorial-ink-muted)";
  const markdown = toMarkdownWithWikiLinks(page.content);

  return (
    <div className="h-full overflow-y-auto bg-editorial-canvas">
      <div className="mx-auto w-full max-w-[1040px] px-5 py-5 sm:px-8 sm:py-8">
        <PageMetadataCard
          page={page}
          typeColor={typeColor}
          onEdit={onEdit}
          onNavigate={onNavigate}
        />

        <article className="mx-auto max-w-[760px] px-1 pb-16 pt-10 sm:px-5">
          <div className="wiki-markdown text-[15px] leading-7 text-editorial-ink">
            <Streamdown
              mode="static"
              plugins={{ cjk, code: lightweightCode, math }}
              shikiTheme={["github-light", "github-dark"]}
              components={{
                a: ({ href, children }: ComponentPropsWithoutRef<"a">) => {
                  if (href?.startsWith("#wikilink-")) {
                    const target = decodeURIComponent(href.slice("#wikilink-".length));
                    return (
                      <button
                        type="button"
                        className="font-medium text-editorial-primary underline decoration-editorial-primary/30 underline-offset-4 transition-colors hover:decoration-editorial-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
                        onClick={() => onNavigate(target)}
                      >
                        {children}
                      </button>
                    );
                  }

                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-editorial-primary underline decoration-editorial-primary/30 underline-offset-4 transition-colors hover:decoration-editorial-primary"
                    >
                      {children}
                    </a>
                  );
                },
                table: MarkdownTable,
              }}
            >
              {markdown}
            </Streamdown>
          </div>

          {backlinks.length > 0 && (
            <section className="mt-12 border-t border-editorial-hairline pt-6">
              <h2 className="mb-3 text-[14px] font-semibold text-editorial-ink">
                {t("wiki.backlinksCount", { count: backlinks.length })}
              </h2>
              <div className="grid gap-1 sm:grid-cols-2">
                {backlinks.map((backlink) => (
                  <button
                    key={backlink.page_id}
                    type="button"
                    className="group flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-editorial-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
                    onClick={() => onNavigate(backlink.slug)}
                  >
                    <ArrowLeft
                      size={13}
                      className="shrink-0 text-editorial-ink-muted transition-transform group-hover:-translate-x-0.5"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-editorial-primary">
                      {backlink.title}
                    </span>
                    <span className="truncate text-[10px] text-editorial-ink-muted">
                      {backlink.path}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}

function PageMetadataCard({
  page,
  typeColor,
  onEdit,
  onNavigate,
}: {
  page: WikiPageRead;
  typeColor: string;
  onEdit?: () => void;
  onNavigate: (target: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-editorial-hairline bg-editorial-surface-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide text-white"
              style={{ backgroundColor: typeColor }}
            >
              {WIKI_TYPE_LABELS[page.type] || page.type}
            </span>
            <span className="truncate text-[12px] text-editorial-ink-muted">{page.path}</span>
          </div>
          <h1 className="mt-3 text-balance text-[26px] font-semibold tracking-[-0.025em] text-editorial-ink sm:text-[30px]">
            {page.title}
          </h1>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-editorial-ink-muted">
            <CalendarClock size={13} />
            <span>更新于 {formatUpdatedAt(page.updated_at)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-[12px] text-editorial-ink hover:bg-editorial-surface-soft"
                onClick={onEdit}
              >
                <Pencil size={13} />
                编辑
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-editorial-hairline pt-4">
        <div className="space-y-3">
          {page.tags.length > 0 && (
            <MetadataRow icon={<Tags size={13} />} label="标签">
              {page.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-editorial-surface-soft px-2 py-1 text-[11px] text-editorial-ink-soft transition-colors hover:bg-editorial-surface-strong"
                >
                  #{tag}
                </span>
              ))}
            </MetadataRow>
          )}

          {page.sources.length > 0 && (
            <MetadataRow icon={<FileText size={13} />} label={`来源 · ${page.sources.length}`}>
              {page.sources.map((source) => (
                <span
                  key={source}
                  className="max-w-full truncate rounded-md border border-editorial-hairline bg-editorial-canvas-soft px-2 py-1 text-[11px] text-editorial-ink-soft"
                  title={source}
                >
                  {source}
                </span>
              ))}
            </MetadataRow>
          )}

          {page.related.length > 0 && (
            <MetadataRow icon={<Link2 size={13} />} label={`关联 · ${page.related.length}`}>
              {page.related.map((related) => (
                <button
                  key={related}
                  type="button"
                  className="rounded-md bg-editorial-surface-soft px-2 py-1 text-[11px] text-editorial-ink-soft transition-colors hover:bg-editorial-surface-strong hover:text-editorial-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong"
                  onClick={() => onNavigate(related)}
                >
                  {related} ↗
                </button>
              ))}
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
      <span className="w-[54px] shrink-0 pt-0.5 text-[11px]">{label}</span>
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
      <div className="mx-auto max-w-[1040px] rounded-2xl border border-editorial-hairline bg-editorial-surface-card p-6">
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

function toMarkdownWithWikiLinks(content: string) {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, alias?: string) => {
      const resolvedTarget = target.trim();
      const label = (alias || target).trim();
      return `[${label}](#wikilink-${encodeURIComponent(resolvedTarget)})`;
    },
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
