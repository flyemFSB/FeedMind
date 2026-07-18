"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileText, Globe, Loader2, Upload, X } from "lucide-react";
import { uploadWikiFile, createWikiSource } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

// ─── Props ────────────────────────────────────────────────────

interface WikiImportDialogProps {
  open: boolean;
  spaceId: string;
  onClose: () => void;
  onImported: () => void;
}

type ImportTab = "file" | "url";

// ─── Component ─────────────────────────────────────────────────

export function WikiImportDialog({ open, spaceId, onClose, onImported }: WikiImportDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ImportTab>("file");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-lg gap-0 rounded-lg bg-editorial-surface-card p-0 text-editorial-ink sm:max-w-lg"
      >
        {/* Header row — no border, kept clean */}
        <div className="flex items-center justify-between px-6 pt-4">
          <DialogTitle className="text-[16px] font-semibold">{t("wiki.importTitle")}</DialogTitle>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted transition-colors hover:bg-editorial-surface-soft"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar — plain buttons, full control over styling */}
        <div className="mx-6 mt-3 flex gap-5 border-b border-editorial-surface-strong">
          <button
            onClick={() => setTab("file")}
            className={`relative flex items-center gap-1.5 pb-2.5 text-[13px] font-medium transition-colors ${
              tab === "file"
                ? "text-editorial-primary"
                : "text-editorial-ink-muted hover:text-editorial-ink"
            }`}
          >
            <FileText size={15} strokeWidth={1.6} />
            {t("wiki.uploadFile")}
            {tab === "file" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-editorial-primary rounded-md" />
            )}
          </button>
          <button
            onClick={() => setTab("url")}
            className={`relative flex items-center gap-1.5 pb-2.5 text-[13px] font-medium transition-colors ${
              tab === "url"
                ? "text-editorial-primary"
                : "text-editorial-ink-muted hover:text-editorial-ink"
            }`}
          >
            <Globe size={15} strokeWidth={1.6} />
            {t("wiki.pasteLink")}
            {tab === "url" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-editorial-primary rounded-md" />
            )}
          </button>
        </div>

        <div className="min-h-[240px] px-6 py-5">
          {tab === "file" ? (
            <FileUploadTab spaceId={spaceId} onImported={onImported} />
          ) : (
            <UrlPasteTab spaceId={spaceId} onImported={onImported} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── File Upload Tab ───────────────────────────────────────────

function FileUploadTab({ spaceId, onImported }: { spaceId: string; onImported: () => void }) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<
    Array<{ name: string; status: "success" | "error"; message?: string }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList) => {
      setUploading(true);
      setResults([]);

      const newResults: Array<{
        name: string;
        status: "success" | "error";
        message?: string;
      }> = [];

      for (const file of Array.from(files)) {
        try {
          const result = await uploadWikiFile(spaceId, file);
          newResults.push({
            name: file.name,
            status: "success",
            message: result.title,
          });
        } catch (err) {
          newResults.push({
            name: file.name,
            status: "error",
            message: err instanceof Error ? err.message : t("wiki.uploadFailed"),
          });
        }
      }

      setResults(newResults);
      setUploading(false);
      if (newResults.some((r) => r.status === "success")) {
        onImported();
      }
    },
    [spaceId, onImported],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? "border-editorial-primary bg-editorial-primary/10"
            : "border-editorial-hairline bg-editorial-canvas-soft hover:border-editorial-ink-muted"
        }`}
      >
        {uploading ? (
          <Loader2 size={28} className="animate-spin text-editorial-primary" />
        ) : (
          <Upload size={28} className="text-editorial-ink-muted" strokeWidth={1.5} />
        )}
        <div className="text-center">
          <p className="text-[13px] font-medium text-editorial-ink">
            {uploading ? t("wiki.uploading") : t("wiki.dropFiles")}
          </p>
          <p className="mt-1 text-[12px] text-editorial-ink-muted">{t("wiki.supportedFormats")}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.pdf,.docx,.xlsx,.pptx,text/markdown,text/plain,application/pdf"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] ${
                r.status === "success"
                  ? "bg-editorial-semantic-success/10 text-editorial-ink"
                  : "bg-editorial-semantic-error/10 text-editorial-semantic-error"
              }`}
            >
              {r.status === "success" ? (
                <CheckCircle2 size={14} className="shrink-0 text-editorial-semantic-success" />
              ) : (
                <X size={14} className="shrink-0 text-editorial-semantic-error" />
              )}
              <span className="truncate font-medium">{r.name}</span>
              {r.message && (
                <span className="ml-auto shrink-0 text-[12px] text-editorial-ink-muted">
                  {r.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── URL Paste Tab ─────────────────────────────────────────────

function UrlPasteTab({ spaceId, onImported }: { spaceId: string; onImported: () => void }) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState("");
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<
    Array<{ url: string; status: "success" | "error"; message?: string }>
  >([]);

  const handleSubmit = async () => {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urlList.length === 0) return;

    setProcessing(true);
    setResults([]);

    const newResults: Array<{
      url: string;
      status: "success" | "error";
      message?: string;
    }> = [];

    for (const url of urlList) {
      try {
        await createWikiSource(spaceId, {
          kind: "url",
          title: url,
          content: url,
          metadata: {},
        });
        newResults.push({ url, status: "success" });
      } catch (err) {
        newResults.push({
          url,
          status: "error",
          message: err instanceof Error ? err.message : t("wiki.processFailed"),
        });
      }
    }

    setResults(newResults);
    setProcessing(false);
    if (newResults.some((r) => r.status === "success")) {
      onImported();
    }
  };

  const isValidUrl = (u: string) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  };

  const urlList = urls
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const validUrls = urlList.filter(isValidUrl);
  const hasError = urlList.length > 0 && validUrls.length !== urlList.length;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-editorial-ink">
          {t("wiki.urlLabel")}
        </label>
        <textarea
          className="min-h-[100px] w-full resize-none rounded-md border border-editorial-hairline bg-editorial-surface-card p-3 text-[13px] text-editorial-ink placeholder:text-editorial-ink-muted outline-none transition-colors focus:border-editorial-primary focus:ring-1 focus:ring-editorial-primary"
          placeholder={t("wiki.urlPlaceholder")}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
        {hasError && (
          <p className="mt-1 text-[12px] text-editorial-semantic-error">{t("wiki.invalidUrls")}</p>
        )}
        {urlList.length > 0 && (
          <p className="mt-1 text-[12px] text-editorial-ink-muted">
            {t("wiki.urlCount", { count: urlList.length, valid: validUrls.length })}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {urlList.length > 0 && (
          <span className="text-[12px] text-editorial-ink-muted">
            {t("wiki.willCreate", { count: validUrls.length })}
          </span>
        )}
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={processing || validUrls.length === 0}
          className="h-9 gap-2 rounded-md bg-editorial-primary px-4 text-[12px] text-editorial-ink-on-primary hover:bg-editorial-primary"
        >
          {processing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t("wiki.importing")}
            </>
          ) : (
            <>
              <Globe size={14} />
              {t("wiki.startImport")}
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="max-h-[120px] space-y-1 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] ${
                r.status === "success"
                  ? "bg-editorial-semantic-success/10 text-editorial-ink"
                  : "bg-editorial-semantic-error/10 text-editorial-semantic-error"
              }`}
            >
              {r.status === "success" ? (
                <CheckCircle2 size={14} className="shrink-0 text-editorial-semantic-success" />
              ) : (
                <X size={14} className="shrink-0 text-editorial-semantic-error" />
              )}
              <span className="truncate">{r.url}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
