import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import type { WikiPageRead, WikiPageUpdate } from "@feedmind/contracts";
import { getWikiPage, updateWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import type { MilkdownEditorHandle } from "./milkdown-editor";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

// 懒加载编辑器，避免只读浏览时加载 Crepe/CodeMirror/Vue 等重依赖
const MilkdownEditor = lazy(() =>
  import("./milkdown-editor").then((m) => ({ default: m.MilkdownEditor })),
);

export interface WikiEditorHandle {
  /** 是否有未保存修改。同步判定：编辑器 onChange 带 300ms 防抖，用上报的脏状态拦截切换会漏 */
  isDirty: () => boolean;
}

interface WikiEditorProps {
  spaceId: string;
  pageId: string;
  onSave: () => void;
  onCancel: () => void;
}

function WikiEditorInner(
  { spaceId, pageId, onSave, onCancel }: WikiEditorProps,
  ref: Ref<WikiEditorHandle>,
) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const loadIdRef = useRef(0);
  const editorRef = useRef<MilkdownEditorHandle>(null);

  const checkDirty = useCallback(() => {
    if (!page) return false;
    // getMarkdown() 取编辑器实时值（同步），不依赖防抖后的 content state
    const latestContent = editorRef.current?.getMarkdown() ?? content;
    return title !== page.title || path !== page.path || latestContent !== page.content;
  }, [page, title, path, content]);

  useImperativeHandle(ref, () => ({ isDirty: checkDirty }), [checkDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  const loadPage = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const result = await getWikiPage(spaceId, pageId);
      if (loadId !== loadIdRef.current) return; // 过期响应，丢弃
      setPage(result);
      setTitle(result.title);
      setContent(result.content);
      setPath(result.path);
    } catch {
      // 错误由 apiFetch toast 统一提示
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleCancelClick = () => {
    if (checkDirty()) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  };

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      // 同步拉取编辑器最新内容，规避 listener 防抖延迟
      const latestContent = editorRef.current?.getMarkdown() ?? content;
      const payload: WikiPageUpdate = { title, content: latestContent, path };
      await updateWikiPage(spaceId, pageId, payload);
      onSave();
    } catch {
      // 错误由 apiFetch toast 统一提示
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-editorial-surface-strong px-6 py-3">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-14 rounded-lg" />
            <Skeleton className="h-7 w-14 rounded-lg" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-body text-editorial-ink-muted">{t("wiki.noPage")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-editorial-surface-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-editorial-surface-strong px-6 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            aria-label={t("wiki.pageTitle")}
            className="h-7 border-0 bg-transparent px-0 text-base font-semibold text-editorial-ink shadow-none placeholder:text-editorial-ink-muted focus-visible:ring-1 focus-visible:ring-editorial-hairline-strong focus-visible:rounded-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("wiki.pageTitlePlaceholder")}
          />
          <Input
            aria-label={t("wiki.path")}
            className="h-5 border-0 bg-transparent px-0 text-xs text-editorial-ink-muted shadow-none placeholder:text-editorial-hairline focus-visible:ring-1 focus-visible:ring-editorial-hairline-strong focus-visible:rounded-sm"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t("wiki.pathPlaceholder")}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelClick}
            className="h-8 rounded-lg px-3 text-xs text-editorial-ink-muted hover:bg-editorial-surface-soft"
          >
            <X size={14} className="mr-1" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
            className="h-8 rounded-lg px-4 text-xs"
          >
            {saving ? t("wiki.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {/* WYSIWYG Markdown 编辑器 */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Skeleton className="h-8 w-48 rounded-lg" />
            </div>
          }
        >
          <MilkdownEditor
            ref={editorRef}
            key={`${pageId}-${i18n.language}`}
            defaultValue={content}
            onChange={setContent}
            placeholder={t("wiki.editorPlaceholder")}
          />
        </Suspense>
      </div>

      <DiscardChangesDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        onDiscard={onCancel}
      />
    </div>
  );
}

export const WikiEditor = forwardRef(WikiEditorInner);
