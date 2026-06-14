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
import { useTranslation } from "react-i18next";

interface PreviewPanelProps {
  onOpenChange?: (open: boolean) => void;
}

export function PreviewPanel({ onOpenChange }: PreviewPanelProps) {
  const { t } = useTranslation();
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

  const title = preview?.title?.trim() || t("chat.preview");

  return (
    <Sheet open={!!preview} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <SheetContent
        side="right"
        className="flex w-[min(620px,42vw)] min-w-[420px] flex-col border-l border-editorial-hairline bg-editorial-surface-card p-0 max-lg:w-[min(520px,78vw)] max-sm:left-6 max-sm:w-auto max-sm:min-w-0"
        showCloseButton={false}
      >
        <SheetHeader className="flex min-h-14 flex-row items-center gap-3 border-b border-editorial-hairline px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-editorial-surface-soft text-editorial-primary">
            <Globe2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-left text-[14px] font-semibold text-editorial-ink">{title}</SheetTitle>
            {(preview?.source || preview?.url) && (
              <SheetDescription className="truncate text-left text-[11px] text-editorial-ink-muted">
                {preview?.source || preview?.url}
              </SheetDescription>
            )}
          </div>
          {preview?.url && (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
              title={t("preview.openInNewTab")}
            >
              <ExternalLink size={16} />
            </a>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 bg-editorial-canvas-soft">
          {preview?.url ? (
            <iframe
              src={preview.url}
              title={title}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          ) : (
            <div className="h-full overflow-auto p-5">
              <pre className="whitespace-pre-wrap rounded-xl bg-editorial-surface-card p-4 text-[12px] leading-6 text-editorial-ink">
                {preview?.content || t("preview.noContent")}
              </pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
