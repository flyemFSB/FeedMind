import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, BookOpen, ChevronDown, Import, MessageCircle, Plus } from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { useAppShell } from "@/components/app-shell/app-shell-context";
import { WikiPageList } from "@/components/wiki/wiki-page-list";
import { WikiImportDialog } from "@/components/wiki/wiki-import-dialog";
import { WikiImportHistory } from "@/components/wiki/wiki-import-history";
import type { WikiSpaceListItem } from "@feedmind/contracts";
import { WikiReader } from "@/components/wiki/wiki-reader";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSourcesView } from "@/components/wiki/wiki-sources-view";
import { WikiGraphView } from "@/components/wiki/wiki-graph-view";
import { WikiLintView } from "@/components/wiki/wiki-lint-view";
import { CreateWikiSpaceDialog } from "@/components/wiki/wiki-create-space";
import { useWikiSpaces, wikiKeys } from "@/lib/hooks/use-wiki";
import { resolveWikiLink } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fadeSlideVariants } from "@/lib/motion";

type WikiView = "pages" | "graph" | "lint" | "sources" | "history";
const VALID_VIEWS: WikiView[] = ["pages", "graph", "lint", "sources", "history"];

export const Route = createFileRoute("/wiki")({
  component: MyWikiPage,
});

function MyWikiPage() {
  const { t } = useTranslation();
  const { openAgentDrawer } = useAppShell();
  const queryClient = useQueryClient();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState(t("wiki.title"));
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const prevIsEditing = useRef(isEditing);

  // 从 URL 读取当前 Wiki 子视图（由左侧全局导航栏驱动）
  const search = useSearch({ strict: false }) as { view?: string };
  const rawView = search.view ?? "pages";
  const activeView: WikiView = VALID_VIEWS.includes(rawView as WikiView)
    ? (rawView as WikiView)
    : "pages";

  const { data: spaces = [], isLoading } = useWikiSpaces();

  // Auto-select first space when data loads
  useEffect(() => {
    if (!isLoading && spaces.length > 0 && !spaceId) {
      setSpaceId(spaces[0].id);
      setSpaceName(spaces[0].name);
    }
  }, [isLoading, spaces, spaceId]);

  // Refresh page list when exiting edit mode
  useEffect(() => {
    if (prevIsEditing.current && !isEditing && spaceId) {
      void queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId) });
    }
    prevIsEditing.current = isEditing;
  }, [isEditing, spaceId, queryClient]);

  const handlePageSelect = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setIsEditing(false);
  }, []);

  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;

  const handleConceptLinkClick = useCallback(
    async (target: string): Promise<string | null> => {
      const currentSpaceId = spaceIdRef.current;
      if (!currentSpaceId) return null;
      try {
        const result = await resolveWikiLink(currentSpaceId, target);
        if (result.resolved && result.page_id) {
          handlePageSelect(result.page_id);
          return result.page_id;
        }
      } catch {
        // handled by apiFetch toast
      }
      return null;
    },
    [handlePageSelect],
  );

  const handleCreateSpace = useCallback(() => {
    setShowCreateSpace(true);
    setShowSpaceMenu(false);
  }, []);

  const handleImportSuccess = useCallback(() => {
    setShowImport(false);
    if (spaceId) {
      void queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId) });
      void queryClient.invalidateQueries({ queryKey: wikiKeys.sources(spaceId) });
    }
  }, [spaceId, queryClient]);

  const handleSpaceSelect = useCallback((s: WikiSpaceListItem) => {
    setSpaceId(s.id);
    setSpaceName(s.name);
    setShowSpaceMenu(false);
    setActivePageId(null);
    setIsEditing(false);
  }, []);

  if (isLoading) {
    return (
      <LayoutWrapper title={t("wiki.title")}>
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-4 w-24" />
        </div>
      </LayoutWrapper>
    );
  }

  if (!spaceId) {
    return (
      <LayoutWrapper title={t("wiki.title")}>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-editorial-surface-soft">
              <BookOpen size={20} className="text-editorial-ink-soft" />
            </div>
            <p className="text-sm text-editorial-ink-soft">{t("wiki.noSpace")}</p>
            <p className="mt-1 text-xs text-editorial-ink-muted">{t("wiki.noSpaceDesc")}</p>
            <Button
              variant="default"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setShowCreateSpace(true)}
            >
              <Plus size={14} />
              {t("wiki.newSpace")}
            </Button>
          </div>
        </div>
        <CreateWikiSpaceDialog
          open={showCreateSpace}
          onClose={() => setShowCreateSpace(false)}
          onCreated={(id, name) => {
            setSpaceId(id);
            setSpaceName(name);
            setShowCreateSpace(false);
            void queryClient.invalidateQueries({ queryKey: wikiKeys.spaces() });
          }}
        />
      </LayoutWrapper>
    );
  }

  const spaceTitle = spaceId ? (
    <DropdownMenu open={showSpaceMenu} onOpenChange={setShowSpaceMenu}>
      <DropdownMenuTrigger
        className="flex cursor-pointer items-center gap-1.5 text-[16px] font-semibold text-editorial-ink hover:text-editorial-primary"
        aria-label={t("wiki.switchSpace")}
      >
        <span>{spaceName}</span>
        <ChevronDown size={14} className="text-editorial-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px] p-1.5">
        {spaces.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => handleSpaceSelect(s)} className="text-[13px]">
            {s.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleCreateSpace}
          className="flex items-center gap-2 rounded-lg text-[13px] text-editorial-primary"
        >
          <Plus size={14} />
          {t("wiki.createNewSpace")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    "Wiki"
  );

  const topRightContent = spaceId ? (
    <>
      <Button
        variant="outline"
        size="default"
        className="gap-2 rounded-lg text-[13px] h-9 border-editorial-hairline-strong bg-editorial-surface-card text-editorial-ink hover:bg-editorial-surface-soft"
        onClick={() => setShowImport(true)}
      >
        <Import size={16} />
        {t("wiki.importTitle")}
      </Button>
      <Button
        variant="outline"
        size="default"
        className="gap-2 rounded-lg text-[13px] h-9 border-editorial-hairline-strong bg-editorial-surface-card text-editorial-ink hover:bg-editorial-surface-soft"
        onClick={openAgentDrawer}
      >
        <MessageCircle size={16} />
        {t("common.askAI")}
      </Button>
    </>
  ) : undefined;

  return (
    <LayoutWrapper showTopbar={false}>
      <div className="flex h-full min-h-0 flex-col">
        {/* 页面内头部：空间选择器 + 按钮（替代原 Topbar），高度与右侧栏一致，下方 border-b 分割 */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-editorial-hairline-soft bg-editorial-surface-soft pl-4 pr-2 sm:pl-6 sm:pr-3">
          <div className="min-w-0">{spaceTitle}</div>
          <div className="flex shrink-0 items-center gap-1.5">{topRightContent}</div>
        </div>

        {/* 视图内容 */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeView}
                className="flex min-h-0 min-w-0 flex-1"
                variants={fadeSlideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {activeView === "pages" && (
                  <DualPaneLayout
                    spaceId={spaceId}
                    activePageId={activePageId}
                    isEditing={isEditing}
                    onPageSelect={handlePageSelect}
                    onClearPage={() => {
                      setActivePageId(null);
                      setIsEditing(false);
                    }}
                    onEdit={() => setIsEditing(true)}
                    onCancelEdit={() => setIsEditing(false)}
                    onConceptLinkClick={(target) => void handleConceptLinkClick(target)}
                  />
                )}
                {activeView === "graph" && spaceId && (
                  <WikiGraphView
                    spaceId={spaceId}
                    onPageSelect={handlePageSelect}
                    onNavigate={handleConceptLinkClick}
                  />
                )}
                {activeView === "lint" && spaceId && (
                  <WikiLintView spaceId={spaceId} onPageSelect={handlePageSelect} />
                )}
                {activeView === "sources" && spaceId && (
                  <div className="flex-1 overflow-y-auto">
                    <WikiSourcesView spaceId={spaceId} />
                  </div>
                )}
                {activeView === "history" && spaceId && (
                  <div className="flex-1 overflow-y-auto">
                    <WikiImportHistory spaceId={spaceId} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {spaceId && (
        <WikiImportDialog
          open={showImport}
          spaceId={spaceId}
          onClose={() => setShowImport(false)}
          onImported={handleImportSuccess}
        />
      )}

      <CreateWikiSpaceDialog
        open={showCreateSpace}
        onClose={() => setShowCreateSpace(false)}
        onCreated={(id, name) => {
          setSpaceId(id);
          setSpaceName(name);
          setShowCreateSpace(false);
        }}
      />
    </LayoutWrapper>
  );
}

function DualPaneLayout({
  spaceId,
  activePageId,
  isEditing,
  onPageSelect,
  onClearPage,
  onEdit,
  onCancelEdit,
  onConceptLinkClick,
}: {
  spaceId: string;
  activePageId: string | null;
  isEditing: boolean;
  onPageSelect: (pageId: string) => void;
  onClearPage: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onConceptLinkClick: (target: string) => void;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside
        className={`h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-editorial-hairline bg-editorial-surface-soft/60 shadow-[1px_0_2px_rgba(0,0,0,0.03)] ${
          activePageId ? "flex max-md:hidden" : "flex max-md:w-full"
        }`}
      >
        <WikiPageList spaceId={spaceId} activePageId={activePageId} onPageSelect={onPageSelect} />
      </aside>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col bg-editorial-surface-card ${
          activePageId ? "flex" : "flex max-md:hidden"
        }`}
      >
        {activePageId && (
          <div className="hidden h-10 shrink-0 items-center border-b border-editorial-hairline px-2 max-md:flex">
            <button
              type="button"
              onClick={onClearPage}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-editorial-ink-soft hover:bg-editorial-surface-soft hover:text-editorial-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ArrowLeft size={14} />
              页面
            </button>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activePageId ? `${activePageId}-${isEditing ? "edit" : "read"}` : "empty"}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            variants={fadeSlideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {activePageId ? (
              isEditing ? (
                <WikiEditor
                  spaceId={spaceId}
                  pageId={activePageId}
                  onSave={() => {
                    onCancelEdit();
                  }}
                  onCancel={onCancelEdit}
                />
              ) : (
                <WikiReader
                  spaceId={spaceId}
                  pageId={activePageId}
                  onEdit={onEdit}
                  onNavigate={onConceptLinkClick}
                />
              )
            ) : (
              <WikiEmptyState />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function WikiEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="mx-auto max-w-[280px] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-editorial-surface-soft">
          <BookOpen size={20} className="text-editorial-ink-soft" />
        </div>
        <h1 className="mb-1 text-[16px] font-semibold text-editorial-ink">
          {t("wiki.selectPage")}
        </h1>
        <p className="text-xs leading-relaxed text-editorial-ink-soft">
          {t("wiki.selectPageDesc")}
        </p>
      </div>
    </div>
  );
}
