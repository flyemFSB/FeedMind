import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  Import,
  Network,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { WikiPageList } from "@/components/wiki/wiki-page-list";
import { WikiImportDialog } from "@/components/wiki/wiki-import-dialog";
import { WikiImportHistory } from "@/components/wiki/wiki-import-history";
import type { WikiSpaceListItem } from "@feedmind/contracts";
import { WikiReader } from "@/components/wiki/wiki-reader";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSourcesView } from "@/components/wiki/wiki-sources-view";
import { WikiGraphView } from "@/components/wiki/wiki-graph-view";
import { WikiReviewView } from "@/components/wiki/wiki-review-view";
import { WikiLintView } from "@/components/wiki/wiki-lint-view";
import { CreateWikiSpaceDialog } from "@/components/wiki/wiki-create-space";
import { useWikiSpaces, useCreateWikiSpace, wikiKeys } from "@/lib/hooks/use-wiki";
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

type WikiView = "pages" | "graph" | "review" | "lint" | "sources";

export const Route = createFileRoute("/wiki")({
  component: MyWikiPage,
});

function MyWikiPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState(t("wiki.title"));
  const [activeView, setActiveView] = useState<WikiView>("pages");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const prevIsEditing = useRef(isEditing);

  const { data: spaces = [], isLoading } = useWikiSpaces();
  const createSpaceMutation = useCreateWikiSpace();

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
      queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId) });
    }
    prevIsEditing.current = isEditing;
  }, [isEditing, spaceId, queryClient]);

  const handlePageSelect = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setActiveView("pages");
    setIsEditing(false);
  }, []);

  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;

  const handleWikilinkClick = useCallback(
    async (target: string) => {
      const currentSpaceId = spaceIdRef.current;
      if (!currentSpaceId) return;
      try {
        const result = await resolveWikiLink(currentSpaceId, target);
        if (result.resolved && result.page_id) {
          handlePageSelect(result.page_id);
        }
      } catch {
        // handled by apiFetch toast
      }
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
      queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId) });
      queryClient.invalidateQueries({ queryKey: wikiKeys.sources(spaceId) });
    }
  }, [spaceId, queryClient]);

  const handleSpaceSelect = useCallback((s: WikiSpaceListItem) => {
    setSpaceId(s.id);
    setSpaceName(s.name);
    setShowSpaceMenu(false);
    setActiveView("pages");
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
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-editorial-surface-soft">
              <BookOpen size={20} className="text-editorial-ink-soft" />
            </div>
            <p className="text-sm text-editorial-ink-soft">
              {t("wiki.noSpace")}
            </p>
            <p className="mt-1 text-xs text-editorial-ink-muted">
              {t("wiki.noSpaceDesc")}
            </p>
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
            queryClient.invalidateQueries({ queryKey: wikiKeys.spaces() });
          }}
        />
      </LayoutWrapper>
    );
  }

  const spaceTitle = spaceId ? (
    <DropdownMenu open={showSpaceMenu} onOpenChange={setShowSpaceMenu}>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 text-[17px] font-semibold text-editorial-ink transition-colors hover:text-editorial-primary cursor-pointer"
        aria-label={t("wiki.switchSpace")}
      >
        <span>{spaceName}</span>
        <ChevronDown size={14} className="text-editorial-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px] rounded-xl p-1.5">
        {spaces.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => handleSpaceSelect(s)}
            className="rounded-lg text-[13px]"
          >
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
    <Button
      variant="default"
      size="default"
      className="gap-2 rounded-lg text-[13px] h-9"
      onClick={() => setShowImport(true)}
    >
      <Import size={16} />
      {t("wiki.importTitle")}
    </Button>
  ) : undefined;

  return (
    <LayoutWrapper title={spaceTitle} topRightContent={topRightContent}>
      <div className="flex h-full">
        <nav className="flex w-12 shrink-0 flex-col items-center border-r border-editorial-surface-strong bg-editorial-canvas-soft py-2">
          <WikiNavButton
            icon={FileText}
            label={t("wiki.tabPages")}
            active={activeView === "pages"}
            onClick={() => setActiveView("pages")}
          />
          <WikiNavButton
            icon={Network}
            label={t("wiki.tabGraph")}
            active={activeView === "graph"}
            onClick={() => setActiveView("graph")}
          />
          <div className="mt-2 mb-2 w-6 border-t border-editorial-surface-strong" />
          <WikiNavButton
            icon={Database}
            label={t("wiki.tabSources")}
            active={activeView === "sources"}
            onClick={() => setActiveView("sources")}
          />
          <div className="mt-auto flex flex-col items-center gap-1 pt-4">
            <WikiNavButton
              icon={Clock}
              label={t("wiki.tabImportHistory")}
              onClick={() => setShowImportHistory(true)}
            />
            <WikiNavButton
              icon={ClipboardCheck}
              label={t("wiki.tabReview")}
              active={activeView === "review"}
              onClick={() => setActiveView("review")}
            />
            <WikiNavButton
              icon={ShieldCheck}
              label={t("wiki.tabLint")}
              active={activeView === "lint"}
              onClick={() => setActiveView("lint")}
            />
          </div>
        </nav>

        <div className="flex min-w-0 flex-1">
          {activeView === "pages" && (
            <DualPaneLayout
              spaceId={spaceId}
              activePageId={activePageId}
              isEditing={isEditing}
              onPageSelect={handlePageSelect}
              onEdit={() => setIsEditing(true)}
              onCancelEdit={() => setIsEditing(false)}
              onWikilinkClick={handleWikilinkClick}
            />
          )}
          {activeView === "graph" && spaceId && (
            <WikiGraphView
              spaceId={spaceId}
              onPageSelect={handlePageSelect}
            />
          )}
          {activeView === "review" && spaceId && (
            <WikiReviewView spaceId={spaceId} />
          )}
          {activeView === "lint" && spaceId && (
            <WikiLintView
              spaceId={spaceId}
              onPageSelect={handlePageSelect}
            />
          )}
          {activeView === "sources" && spaceId && (
            <div className="flex-1 overflow-y-auto">
              <WikiSourcesView spaceId={spaceId} />
            </div>
          )}
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

      {spaceId && (
        <WikiImportHistory
          open={showImportHistory}
          spaceId={spaceId}
          onClose={() => setShowImportHistory(false)}
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

function WikiNavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-editorial-primary text-editorial-ink-on-primary shadow-sm"
          : "text-editorial-ink-muted hover:bg-editorial-surface-strong hover:text-editorial-ink"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.6} />
    </button>
  );
}

function DualPaneLayout({
  spaceId,
  activePageId,
  isEditing,
  onPageSelect,
  onEdit,
  onCancelEdit,
  onWikilinkClick,
}: {
  spaceId: string;
  activePageId: string | null;
  isEditing: boolean;
  onPageSelect: (pageId: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onWikilinkClick: (target: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-editorial-surface-strong bg-editorial-surface-card">
        <WikiPageList
          spaceId={spaceId}
          activePageId={activePageId}
          onPageSelect={onPageSelect}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-editorial-surface-card">
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
              onNavigate={onWikilinkClick}
            />
          )
        ) : (
          <WikiEmptyState />
        )}
      </div>
    </div>
  );
}

function WikiEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="mx-auto max-w-[280px] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-editorial-surface-soft">
          <BookOpen size={20} className="text-editorial-ink-soft" />
        </div>
        <h3 className="mb-1 text-[15px] font-semibold text-editorial-ink">
          {t("wiki.selectPage")}
        </h3>
        <p className="text-xs leading-relaxed text-editorial-ink-soft">
          {t("wiki.selectPageDesc")}
        </p>
      </div>
    </div>
  );
}
