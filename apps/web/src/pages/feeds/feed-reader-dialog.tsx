import { useState, useMemo } from "react";
import { CalendarDays, ExternalLink, Sparkles, BookMarked, Check, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useWikiSpaces } from "@/lib/hooks/use-wiki";
import { createWikiSource } from "@/lib/api/wiki";
import { useAppShell } from "@/app/shell/app-shell-context";
import type { FeedItem, RssSource } from "@/lib/api/feeds";
import { cn } from "@/lib/utils";

interface FeedReaderDialogProps {
  item: FeedItem | null;
  source?: RssSource | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 剥除 HTML 标签后按段落拆分（纯文本渲染，不注入远端 HTML） */
function parseParagraphs(htmlOrText: string): string[] {
  const doc = new DOMParser().parseFromString(htmlOrText, "text/html");
  // 把换行与块级元素的边界都归一成空行，剩下的交给 split
  for (const br of doc.querySelectorAll("br")) br.replaceWith("\n");
  for (const block of doc.querySelectorAll("p, div, li, h1, h2, h3, h4, blockquote")) {
    block.append("\n\n");
  }
  return (doc.body.textContent ?? "")
    .split(/\n\s*\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function FeedReaderDialog({ item, source, open, onOpenChange }: FeedReaderDialogProps) {
  const { t } = useTranslation();
  const { data: spaces = [] } = useWikiSpaces();
  const { openAgentDrawer, setWorkspaceContext } = useAppShell();
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingested, setIngested] = useState(false);

  // 选中的沉淀目标空间：默认首个空间
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const activeSpaceId = selectedSpaceId ?? spaces[0]?.id ?? null;

  const paragraphs = useMemo(() => {
    if (!item?.description) return [];
    return parseParagraphs(item.description);
  }, [item?.description]);

  if (!item) return null;

  const handleIngest = async () => {
    if (!activeSpaceId) {
      toast.add({
        title: t("wiki.noSpaceAvailable", "请先在 Wiki 中创建一个知识库空间"),
        type: "error",
      });
      return;
    }
    setIsIngesting(true);
    try {
      await createWikiSource(activeSpaceId, {
        kind: "text",
        title: item.title,
        content: item.description || item.title,
        original_uri: item.link ?? undefined,
        metadata: {},
      });
      setIngested(true);
      toast.add({
        title: t("feeds.ingestSuccess", "已沉淀到知识库，概念提炼已在后台启动"),
        type: "success",
      });
    } catch {
      toast.add({
        title: t("feeds.ingestFailed", "沉淀失败，请稍后重试"),
        type: "error",
      });
    } finally {
      setIsIngesting(false);
    }
  };

  const handleAskAgent = () => {
    setWorkspaceContext({
      type: "feed",
      feedId: item.id,
      feedTitle: item.title,
      feedUrl: item.link ?? undefined,
      snippet: paragraphs[0] ?? item.description ?? undefined,
    });
    openAgentDrawer();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-editorial-surface-card border-editorial-hairline shadow-2xl">
        {/* 顶部操作与元数据栏 */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-editorial-hairline-soft shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-tiny font-medium",
                source?.type === "social"
                  ? "bg-editorial-accent-soft text-editorial-accent"
                  : "bg-editorial-surface-strong text-editorial-ink-soft",
              )}
            >
              {source?.title ?? (source?.type === "rss" ? "RSS" : "资讯")}
            </span>

            {item.author && (
              <span className="inline-flex items-center gap-1 text-tiny text-editorial-ink-muted">
                <User size={11} />
                {item.author}
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-tiny text-editorial-ink-muted ml-auto mr-6">
              <CalendarDays size={11} />
              {new Date(item.pubDate ?? item.fetchedAt).toLocaleDateString()}
            </span>
          </div>

          <DialogTitle className="text-lg font-serif font-bold leading-snug text-editorial-ink text-left">
            {item.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{item.title} 阅读视图</DialogDescription>
        </DialogHeader>

        {/* 文章主体滚动区 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {item.image && (
            <div className="aspect-[16/9] w-full overflow-hidden rounded-lg bg-editorial-surface-soft border border-editorial-hairline-soft mb-4">
              <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          )}

          {paragraphs.length > 0 ? (
            paragraphs.map((p, idx) => (
              <p
                key={`${item.id}-p-${idx}`}
                className="text-sm leading-relaxed text-editorial-ink/90 font-sans selection:bg-editorial-accent/20"
              >
                {p}
              </p>
            ))
          ) : (
            <p className="text-sm text-editorial-ink-muted italic">
              {t("feeds.noFullContent", "此条目无内嵌正文，可点击下方打开原文阅读。")}
            </p>
          )}
        </div>

        {/* 底部动作工具栏 */}
        <div className="px-6 py-3.5 border-t border-editorial-hairline-soft bg-editorial-surface-soft flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {spaces.length > 1 && (
              <select
                aria-label={t("wiki.selectSpace", "选择知识库空间")}
                value={activeSpaceId ?? ""}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                disabled={isIngesting || ingested}
                className="h-8 rounded-md border border-editorial-hairline bg-editorial-surface-card px-2 text-xs text-editorial-ink focus:border-editorial-accent outline-none"
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <Button
              size="sm"
              variant={ingested ? "outline" : "default"}
              onClick={() => void handleIngest()}
              disabled={isIngesting || ingested}
              className={cn(
                "h-8 gap-1.5 text-xs rounded-md",
                ingested && "text-editorial-semantic-success border-editorial-semantic-success/30",
              )}
            >
              {ingested ? <Check size={13} /> : <BookMarked size={13} />}
              {ingested ? "已沉淀到知识库" : isIngesting ? "正在沉淀..." : "沉淀到知识库"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAskAgent}
              className="h-8 gap-1.5 text-xs rounded-md hover:border-editorial-accent/50 hover:text-editorial-accent"
            >
              <Sparkles size={13} className="text-editorial-accent" />
              让 AI 分析
            </Button>
          </div>

          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-editorial-ink-muted hover:text-editorial-ink transition-colors"
            >
              打开原文
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
