"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ClipboardCheck, Database, FileText, Network, Plus, Search, ShieldCheck } from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { WikiPageList } from "@/components/wiki/wiki-page-list";
import { WikiReader } from "@/components/wiki/wiki-reader";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSourcesView } from "@/components/wiki/wiki-sources-view";
import { WikiGraphView } from "@/components/wiki/wiki-graph-view";
import { WikiSearchView } from "@/components/wiki/wiki-search-view";
import { WikiReviewView } from "@/components/wiki/wiki-review-view";
import { WikiLintView } from "@/components/wiki/wiki-lint-view";
import { CreateWikiSpaceDialog } from "@/components/wiki/wiki-create-space";
import { listWikiSpaces, resolveWikiLink } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type WikiView = "pages" | "search" | "graph" | "review" | "lint" | "sources";

export default function MyWikiPage() {
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WikiView>("pages");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageListRefreshKey, setPageListRefreshKey] = useState(0);
  const prevIsEditing = useRef(isEditing);

  // Refresh page list when exiting edit mode (page was possibly saved/edited)
  useEffect(() => {
    if (prevIsEditing.current && !isEditing) {
      setPageListRefreshKey((k) => k + 1);
    }
    prevIsEditing.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    async function init() {
      try {
        const spaces = await listWikiSpaces();
        if (spaces.length > 0) {
          setSpaceId(spaces[0].id);
        }
      } catch {
        // handled by apiFetch toast
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handlePageSelect = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setIsEditing(false);
  }, []);

  const handleWikilinkClick = useCallback(
    async (target: string) => {
      if (!spaceId) return;
      try {
        const result = await resolveWikiLink(spaceId, target);
        if (result.resolved && result.page_id) {
          handlePageSelect(result.page_id);
        }
      } catch {
        // handled by apiFetch toast
      }
    },
    [spaceId, handlePageSelect],
  );

  if (loading) {
    return (
      <LayoutWrapper title="Wiki">
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-4 w-24" />
        </div>
      </LayoutWrapper>
    );
  }

  if (!spaceId) {
    return (
      <LayoutWrapper title="Wiki">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7]">
              <BookOpen size={20} className="text-[#6e6e73]" />
            </div>
            <p className="text-sm text-[#6e6e73]">尚未创建 Wiki 空间</p>
            <p className="mt-1 text-xs text-[#86868b]">
              创建一个新空间来开始整理你的知识
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setShowCreateSpace(true)}
            >
              <Plus size={14} />
              创建空间
            </Button>
          </div>
        </div>
        <CreateWikiSpaceDialog
          open={showCreateSpace}
          onClose={() => setShowCreateSpace(false)}
          onCreated={(id) => {
            setSpaceId(id);
            setShowCreateSpace(false);
          }}
        />
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper title="Wiki">
      <div className="flex h-full">
        {/* Left icon sidebar — like llm_wiki but slim */}
        <nav className="flex w-12 shrink-0 flex-col items-center border-r border-[#e8e8ed] bg-[#fafafc] py-2">
          <WikiNavButton
            icon={FileText}
            label="页面"
            active={activeView === "pages"}
            onClick={() => setActiveView("pages")}
          />
          <WikiNavButton
            icon={Search}
            label="搜索"
            active={activeView === "search"}
            onClick={() => setActiveView("search")}
          />
          <WikiNavButton
            icon={Network}
            label="图谱"
            active={activeView === "graph"}
            onClick={() => setActiveView("graph")}
          />
          <div className="mt-auto flex flex-col items-center gap-1 pt-4">
            <WikiNavButton
              icon={ClipboardCheck}
              label="Review"
              active={activeView === "review"}
              onClick={() => setActiveView("review")}
            />
            <WikiNavButton
              icon={ShieldCheck}
              label="Lint"
              active={activeView === "lint"}
              onClick={() => setActiveView("lint")}
            />
            <WikiNavButton
              icon={Database}
              label="来源"
              active={activeView === "sources"}
              onClick={() => setActiveView("sources")}
            />
          </div>
        </nav>

        {/* Content area */}
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
              pageListRefreshKey={pageListRefreshKey}
            />
          )}
          {activeView === "search" && spaceId && (
            <WikiSearchView spaceId={spaceId} onPageSelect={handlePageSelect} />
          )}
          {activeView === "graph" && spaceId && (
            <WikiGraphView spaceId={spaceId} onPageSelect={handlePageSelect} />
          )}
          {activeView === "review" && spaceId && (
            <WikiReviewView spaceId={spaceId} />
          )}
          {activeView === "lint" && spaceId && (
            <WikiLintView spaceId={spaceId} onPageSelect={handlePageSelect} />
          )}
          {activeView === "sources" && spaceId && (
            <div className="flex-1 overflow-y-auto">
              <WikiSourcesView spaceId={spaceId} />
            </div>
          )}
        </div>
      </div>
    </LayoutWrapper>
  );
}

// ─── Icon nav button ──────────────────────────────────────────

function WikiNavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-[#0071e3] text-white shadow-sm"
          : "text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.6} />
    </button>
  );
}

// ─── Dual pane: page list + reader/editor ─────────────────────

function DualPaneLayout({
  spaceId,
  activePageId,
  isEditing,
  onPageSelect,
  onEdit,
  onCancelEdit,
  onWikilinkClick,
  pageListRefreshKey,
}: {
  spaceId: string;
  activePageId: string | null;
  isEditing: boolean;
  onPageSelect: (pageId: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onWikilinkClick: (target: string) => void;
  pageListRefreshKey?: number;
}) {
  return (
    <div className="flex min-w-0 flex-1">
      {/* Page list panel */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#e8e8ed] bg-white">
        <WikiPageList
          spaceId={spaceId}
          activePageId={activePageId}
          onPageSelect={onPageSelect}
          refreshTrigger={pageListRefreshKey}
        />
      </aside>

      {/* Reader / Editor */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
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
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="mx-auto max-w-[280px] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f5f7]">
          <BookOpen size={20} className="text-[#6e6e73]" />
        </div>
        <h3 className="mb-1 text-[15px] font-semibold text-[#1d1d1f]">
          选择一个页面
        </h3>
        <p className="text-xs leading-relaxed text-[#6e6e73]">
          从左侧列表选择一个页面查看，或创建新页面开始整理你的知识
        </p>
      </div>
    </div>
  );
}
