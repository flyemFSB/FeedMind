"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Database, FileText, Search } from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { WikiPageList } from "@/components/wiki/wiki-page-list";
import { WikiReader } from "@/components/wiki/wiki-reader";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSourcesView } from "@/components/wiki/wiki-sources-view";
import { listWikiSpaces, resolveWikiLink } from "@/lib/api/wiki";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

type WikiTab = "pages" | "sources" | "search";

export default function MyWikiPage() {
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WikiTab>("pages");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handlePageSelect = (pageId: string) => {
    setActivePageId(pageId);
    setIsEditing(false);
    setActiveTab("pages");
  };

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
    [spaceId],
  );

  if (loading) {
    return (
      <LayoutWrapper title="我的 Wiki">
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-4 w-24" />
        </div>
      </LayoutWrapper>
    );
  }

  if (!spaceId) {
    return (
      <LayoutWrapper title="我的 Wiki">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-secondary-text">
              尚未创建 Wiki 空间
            </p>
            <p className="mt-1 text-xs text-border-strong">
              请启动后端服务后刷新页面
            </p>
          </div>
        </div>
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper title="我的 Wiki">
      <div className="flex h-full">
        {/* Wiki sidebar */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-card">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as WikiTab)}
            className="flex flex-1 flex-col gap-0"
          >
            <TabsList
              variant="line"
              className="w-full justify-stretch gap-0 rounded-none bg-transparent p-0"
            >
              {[
                { id: "pages" as const, label: "页面", icon: FileText },
                { id: "sources" as const, label: "来源", icon: Database },
                { id: "search" as const, label: "搜索", icon: Search },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="h-auto flex-1 rounded-none px-2 py-2.5 text-[11px] font-medium after:bottom-0"
                >
                  <tab.icon size={13} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent
              value="pages"
              className="mt-0 flex-1 overflow-hidden"
            >
              <WikiPageList
                spaceId={spaceId}
                activePageId={activePageId}
                onPageSelect={handlePageSelect}
              />
            </TabsContent>
            <TabsContent
              value="sources"
              className="mt-0 flex-1 overflow-hidden"
            >
              <WikiSourcesView spaceId={spaceId} />
            </TabsContent>
            <TabsContent
              value="search"
              className="mt-0 flex-1 overflow-hidden"
            >
              <div className="flex h-full items-center justify-center p-6">
                <p className="text-xs text-secondary-text">
                  搜索功能将在后续版本实现
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {activePageId ? (
            isEditing ? (
              <WikiEditor
                spaceId={spaceId}
                pageId={activePageId}
                onSave={() => {
                  setIsEditing(false);
                  // Force re-render of reader
                  setActivePageId(activePageId);
                }}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <WikiReader
                spaceId={spaceId}
                pageId={activePageId}
                onEdit={() => setIsEditing(true)}
                onNavigate={handleWikilinkClick}
              />
            )
          ) : (
            <div className="flex h-full flex-1 items-center justify-center">
              <div className="mx-auto max-w-[280px] text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface">
                  <BookOpen size={20} className="text-secondary-text" />
                </div>
                <h3 className="mb-1 text-[15px] font-semibold text-foreground">
                  选择一个页面
                </h3>
                <p className="text-xs leading-relaxed text-secondary-text">
                  从左侧列表选择一个页面查看，或创建新页面开始整理你的知识。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </LayoutWrapper>
  );
}
