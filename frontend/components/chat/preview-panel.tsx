"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onPreviewOpen, type PreviewPayload } from "@/lib/preview-events";

interface PreviewPanelProps {
  onOpenChange?: (open: boolean) => void;
}

export function PreviewPanel({ onOpenChange }: PreviewPanelProps) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);

  useEffect(
    () =>
      onPreviewOpen((payload) => {
        setPreview(payload);
        onOpenChange?.(true);
      }),
    [onOpenChange],
  );

  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  if (!preview) return null;

  const closePreview = () => {
    setPreview(null);
    onOpenChange?.(false);
  };
  const title = preview.title?.trim() || "预览";

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(620px,42vw)] min-w-[420px] animate-in slide-in-from-right duration-200 flex-col overflow-hidden border-l border-[#d2d2d7] bg-white shadow-[-18px_0_48px_rgba(0,0,0,0.12)] max-lg:w-[min(520px,78vw)] max-sm:left-6 max-sm:w-auto max-sm:min-w-0">
      <div className="flex min-h-14 items-center gap-3 border-b border-[#d2d2d7] px-4">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f5f5f7] text-[#0071e3]">
          <Globe2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-[#1d1d1f]">{title}</div>
          {(preview.source || preview.url) && (
            <div className="truncate text-[11px] text-[#86868b]">{preview.source || preview.url}</div>
          )}
        </div>
        {preview.url && (
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            title="在新标签页打开"
          >
            <ExternalLink size={16} />
          </a>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
          title="关闭预览"
          onClick={closePreview}
        >
          <X size={17} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-[#fbfbfd]">
        {preview.url ? (
          <iframe
            src={preview.url}
            title={title}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          />
        ) : (
          <div className="h-full overflow-auto p-5">
            <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 text-[12px] leading-6 text-[#1d1d1f]">
              {preview.content || "没有可预览的内容"}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}
