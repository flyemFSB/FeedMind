"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

  const closePreview = () => {
    setPreview(null);
    onOpenChange?.(false);
  };

  const title = preview?.title?.trim() || "预览";

  return (
    <Sheet open={!!preview} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <SheetContent
        side="right"
        className="flex w-[min(620px,42vw)] min-w-[420px] flex-col border-l border-[#d2d2d7] bg-white p-0 max-lg:w-[min(520px,78vw)] max-sm:left-6 max-sm:w-auto max-sm:min-w-0"
        showCloseButton={false}
      >
        <SheetHeader className="flex min-h-14 flex-row items-center gap-3 border-b border-[#d2d2d7] px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f5f5f7] text-[#0071e3]">
            <Globe2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-left text-[14px] font-semibold text-[#1d1d1f]">{title}</SheetTitle>
            {(preview?.source || preview?.url) && (
              <SheetDescription className="truncate text-left text-[11px] text-[#86868b]">
                {preview?.source || preview?.url}
              </SheetDescription>
            )}
          </div>
          {preview?.url && (
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
        </SheetHeader>

        <div className="min-h-0 flex-1 bg-[#fbfbfd]">
          {preview?.url ? (
            <iframe
              src={preview.url}
              title={title}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          ) : (
            <div className="h-full overflow-auto p-5">
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 text-[12px] leading-6 text-[#1d1d1f]">
                {preview?.content || "没有可预览的内容"}
              </pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
