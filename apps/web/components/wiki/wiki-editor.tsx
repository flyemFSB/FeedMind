"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WikiPageRead, WikiPageUpdate } from "@feedmind/contracts";
import { getWikiPage, updateWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        <p className="text-[13px] text-editorial-ink-muted">{t("wiki.noPage")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-editorial-surface-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-editorial-surface-strong px-6 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            className="h-7 border-0 bg-transparent px-0 text-[17px] font-semibold text-editorial-ink shadow-none placeholder:text-editorial-ink-muted focus-visible:ring-0"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("wiki.pageTitlePlaceholder")}
          />
          <Input
            className="h-5 border-0 bg-transparent px-0 text-[11px] text-editorial-ink-muted shadow-none placeholder:text-editorial-hairline focus-visible:ring-0"
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
            className="h-8 rounded-lg px-3 text-[12px] text-editorial-ink-muted hover:bg-editorial-surface-soft"
          >
            <X size={14} className="mr-1" />
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 rounded-lg bg-editorial-primary px-4 text-[12px] text-editorial-ink-on-primary hover:bg-editorial-primary"
          >
            {saving ? t("wiki.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {/* Editor textarea */}
      <div className="flex-1 overflow-hidden">
        <textarea
          className="flex h-full w-full resize-none border-0 bg-editorial-surface-card p-6 font-mono text-[12px] leading-relaxed text-editorial-ink placeholder:text-editorial-hairline outline-none focus-visible:ring-0"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("wiki.editorPlaceholder") + "\n" + t("wiki.wikilinkHint")}
        />
      </div>
    </div>
  );
}
