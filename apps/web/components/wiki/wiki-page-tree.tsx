"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Plus,
  Search,
} from "lucide-react";
import type { WikiPageListItem } from "@feedmind/contracts";
import { useWikiPages } from "@/lib/hooks/use-wiki";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_TYPE_COLORS, WIKI_TYPE_LABELS } from "./constants";
import { CreateWikiPageDialog } from "./wiki-create-page";

interface WikiPageTreeProps {
  spaceId: string;
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
  refreshTrigger?: number;
}

interface TreeNode {
  id: string;
  label: string;
  type: "folder" | "page";
  pageId?: string;
  pageType?: string;
  children: TreeNode[];
  depth: number;
}

export function WikiPageTree({
  spaceId,
  activePageId,
  onPageSelect,
}: WikiPageTreeProps) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const { data, isLoading } = useWikiPages(spaceId);
  const pages = data?.items ?? [];
  const tree = useMemo(() => buildTree(pages, search), [pages, search]);

  useEffect(() => {
    if (tree.length > 0 && expandedFolders.size === 0) {
      const topFolders = tree.filter((n) => n.type === "folder");
      setExpandedFolders(new Set(topFolders.map((f) => f.id)));
    }
  }, [tree]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[13px] font-semibold text-[#1d1d1f]">页面</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setShowCreate(true)}
          className="h-7 w-7 rounded-md text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#0071e3]"
          title="新建页面"
        >
          <Plus size={15} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <Input
            className="h-8 rounded-lg border-[#e8e8ed] pl-8 text-[12px] placeholder:text-[#86868b] focus:border-[#0071e3]"
            placeholder="搜索页面..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-1 py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${12 + (i % 3) * 16}px` }}>
                <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7]">
              <FileText size={16} className="text-[#86868b]" />
            </div>
            <p className="text-[13px] font-medium text-[#1d1d1f]">
              {search ? "没有匹配的页面" : "暂无页面"}
            </p>
            <p className="mt-1 text-[11px] text-[#86868b]">
              {search ? "尝试其他关键词" : "点击 + 创建第一个页面"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                activePageId={activePageId}
                expandedFolders={expandedFolders}
                onToggle={toggleFolder}
                onSelect={onPageSelect}
              />
            ))}
          </div>
        )}
      </div>

      <CreateWikiPageDialog
        open={showCreate}
        spaceId={spaceId}
        onClose={() => setShowCreate(false)}
        onCreated={(pageId) => {
          setShowCreate(false);
          onPageSelect(pageId);
        }}
      />
    </div>
  );
}

function TreeNodeItem({
  node,
  activePageId,
  expandedFolders,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  activePageId: string | null;
  expandedFolders: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.id);
  const isActive = node.type === "page" && activePageId === node.pageId;

  if (node.type === "folder") {
    return (
      <Collapsible open={isExpanded} onOpenChange={() => onToggle(node.id)}>
        <CollapsibleTrigger
          className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#f5f5f7] cursor-pointer"
          style={{ paddingLeft: `${8 + node.depth * 16}px` }}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="shrink-0 text-[#86868b]" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-[#86868b]" />
          )}
          <Folder size={13} className="shrink-0 text-[#0071e3]" strokeWidth={1.5} />
          <span className="truncate text-[12px] text-[#1d1d1f]">{node.label}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                activePageId={activePageId}
                expandedFolders={expandedFolders}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const typeColor = WIKI_TYPE_COLORS[node.pageType || ""] || "#86868b";

  return (
    <button
      onClick={() => node.pageId && onSelect(node.pageId)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
        isActive ? "bg-[#e8f0fe]" : "hover:bg-[#f5f5f7]"
      }`}
      style={{ paddingLeft: `${8 + node.depth * 16}px` }}
    >
      <FileText size={13} className="shrink-0" strokeWidth={1.5} style={{ color: typeColor }} />
      <span className={`min-w-0 flex-1 truncate text-[12px] ${isActive ? "font-medium text-[#0071e3]" : "text-[#1d1d1f]"}`}>
        {node.label}
      </span>
      {node.pageType && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-medium text-white opacity-70" style={{ backgroundColor: typeColor }}>
          {WIKI_TYPE_LABELS[node.pageType] || node.pageType}
        </span>
      )}
    </button>
  );
}

function buildTree(pages: WikiPageListItem[], search: string): TreeNode[] {
  const filtered = search
    ? pages.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : pages;

  const pathMap = new Map<string, TreeNode>();

  for (const page of filtered) {
    const path = page.path || `wiki/${page.title.toLowerCase().replace(/\s+/g, "-")}.md`;
    const segments = path.replace(/\.md$/i, "").split("/").filter(Boolean);
    const dirs = segments.slice(0, -1);
    let currentPath = "";

    for (let i = 0; i < dirs.length; i++) {
      currentPath = currentPath ? `${currentPath}/${dirs[i]}` : dirs[i];
      if (!pathMap.has(currentPath)) {
        pathMap.set(currentPath, {
          id: `folder:${currentPath}`,
          label: dirs[i] || "",
          type: "folder",
          children: [],
          depth: i,
        });
      }
    }

    const pageNode: TreeNode = {
      id: `page:${page.id}`,
      label: page.title,
      type: "page",
      pageId: page.id,
      pageType: page.type,
      children: [],
      depth: dirs.length,
    };

    if (dirs.length > 0) {
      const parent = pathMap.get(dirs.join("/"));
      if (parent) parent.children.push(pageNode);
    } else {
      const rootKey = "_root";
      if (!pathMap.has(rootKey)) {
        pathMap.set(rootKey, { id: "folder:_root", label: "", type: "folder", children: [], depth: -1 });
      }
      pathMap.get(rootKey)!.children.push(pageNode);
    }
  }

  for (const node of pathMap.values()) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.label.localeCompare(b.label, "zh-CN");
    });
  }

  const topLevel: TreeNode[] = [];
  const processedFolders = new Set<string>();
  const folderKeys = [...pathMap.keys()].filter((k) => k !== "_root");

  for (const key of folderKeys) {
    const parts = key.split("/");
    const parentKey = parts.slice(0, -1).join("/");
    if (parentKey && pathMap.has(parentKey)) {
      const parent = pathMap.get(parentKey)!;
      if (!parent.children.find((c) => c.id === pathMap.get(key)!.id)) {
        parent.children.push(pathMap.get(key)!);
      }
    } else if (!processedFolders.has(key)) {
      topLevel.push(pathMap.get(key)!);
      processedFolders.add(key);
    }
  }

  const rootNode = pathMap.get("_root");
  if (rootNode) topLevel.push(...rootNode.children);

  return topLevel.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.label.localeCompare(b.label, "zh-CN");
  });
}
