"use client";

import { useCallback, useEffect, useState } from "react";
import type { WikiPageRead, WikiPageUpdate } from "@feedmind/contracts";
import { getWikiPage, updateWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiEditorProps {
  spaceId: string;
  pageId: string;
  onSave: () => void;
  onCancel: () => void;
}

export function WikiEditor({
  spaceId,
  pageId,
  onSave,
  onCancel,
}: WikiEditorProps) {
  const [page, setPage] = useState<WikiPageRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWikiPage(spaceId, pageId);
      setPage(result);
      setTitle(result.title);
      setContent(result.content);
      setPath(result.path);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const payload: WikiPageUpdate = {
        title,
        content,
        path,
      };
      await updateWikiPage(spaceId, pageId, payload);
      onSave();
    } catch {
      // handled by apiFetch toast
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="space-y-1.5 flex-1 mr-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
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
        <p className="text-xs text-secondary-text">页面不存在</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            className="h-7 border-0 bg-transparent px-0 text-[17px] font-semibold text-foreground shadow-none placeholder:text-border-strong focus-visible:ring-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题"
          />
          <Input
            className="h-5 border-0 bg-transparent px-0 text-xs text-secondary-text shadow-none placeholder:text-border-strong focus-visible:ring-0"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="wiki/path/to/page.md"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          className="flex h-full w-full resize-none border-0 bg-transparent p-6 font-mono text-xs leading-relaxed text-foreground shadow-none placeholder:text-border-strong outline-none focus-visible:ring-0"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"使用 Markdown 编写页面内容...\n[[wikilink]] 支持交叉引用"}
        />
      </div>
    </div>
  );
}
