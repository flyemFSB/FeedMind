"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WikiPageRead, WikiPageUpdate } from "@feedmind/contracts";
import { getWikiPage, updateWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";

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
  const loadIdRef = useRef(0);

  const loadPage = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    try {
      const result = await getWikiPage(spaceId, pageId);
      if (loadId !== loadIdRef.current) return; // stale
      setPage(result);
      setTitle(result.title);
      setContent(result.content);
      setPath(result.path);
    } catch {
      // handled by apiFetch toast
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [spaceId, pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const payload: WikiPageUpdate = { title, content, path };
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
        <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-3">
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
        <p className="text-[13px] text-[#86868b]">页面不存在</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-[#e8e8ed] px-6 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            className="h-7 border-0 bg-transparent px-0 text-[17px] font-semibold text-[#1d1d1f] shadow-none placeholder:text-[#86868b] focus-visible:ring-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题"
          />
          <Input
            className="h-5 border-0 bg-transparent px-0 text-[11px] text-[#86868b] shadow-none placeholder:text-[#d2d2d7] focus-visible:ring-0"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="wiki/path/to/page.md"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 rounded-lg px-3 text-[12px] text-[#86868b] hover:bg-[#f5f5f7]"
          >
            <X size={14} className="mr-1" />
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 rounded-lg bg-[#0071e3] px-4 text-[12px] text-white hover:bg-[#0066cc]"
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Editor textarea */}
      <div className="flex-1 overflow-hidden">
        <textarea
          className="flex h-full w-full resize-none border-0 bg-white p-6 font-mono text-[12px] leading-relaxed text-[#1d1d1f] placeholder:text-[#d2d2d7] outline-none focus-visible:ring-0"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"使用 Markdown 编写页面内容...\n[[wikilink]] 支持交叉引用"}
        />
      </div>
    </div>
  );
}
