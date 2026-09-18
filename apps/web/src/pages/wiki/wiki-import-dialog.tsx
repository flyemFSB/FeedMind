import { useCallback, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { CheckCircle2, FileText, Globe, Upload, X } from "lucide-react";
import { uploadWikiFile, createWikiSource } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { fadeSlideVariants } from "@/lib/motion";

// ─── 组件属性与辅助函数 ─────────────────────────────────────

// 纯校验函数：模块级定义避免每次渲染重建
function isValidUrl(u: string) {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

interface WikiImportDialogProps {
  open: boolean;
  spaceId: string;
  onClose: () => void;
  onImported: () => void;
}

type ImportTab = "file" | "url";

// ─── 导入弹窗主体组件 ───────────────────────────────────────

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
        {/* 头部行：无边框，保持简洁 */}
        <div className="flex items-center justify-between px-6 pt-4">
          <DialogTitle className="text-base font-semibold">{t("wiki.importTitle")}</DialogTitle>
          <m.button
            onClick={onClose}
            type="button"
            whileTap={{ scale: 0.92 }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-editorial-ink-muted hover:bg-editorial-surface-soft"
          >
            <X size={16} />
          </m.button>
        </div>

        {/* Tab 栏：用纯按钮，样式完全自控 */}
        <div className="mx-6 mt-3 flex gap-5 border-b border-editorial-surface-strong">
          <m.button
            onClick={() => setTab("file")}
            type="button"
            whileTap={{ scale: 0.98 }}
            className={`relative flex items-center gap-1.5 pb-2.5 text-body font-medium ${
              tab === "file"
                ? "text-editorial-primary"
                : "text-editorial-ink-muted hover:text-editorial-ink"
            }`}
          >
            <FileText size={15} strokeWidth={1.6} />
            {t("wiki.uploadFile")}
            {tab === "file" && (
              <m.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 bottom-0 left-0 h-0.5 origin-left rounded-md bg-editorial-primary"
              />
            )}
          </m.button>
          <m.button
            onClick={() => setTab("url")}
            type="button"
            whileTap={{ scale: 0.98 }}
            className={`relative flex items-center gap-1.5 pb-2.5 text-body font-medium ${
              tab === "url"
                ? "text-editorial-primary"
                : "text-editorial-ink-muted hover:text-editorial-ink"
            }`}
          >
            <Globe size={15} strokeWidth={1.6} />
            {t("wiki.pasteLink")}
            {tab === "url" && (
              <m.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 bottom-0 left-0 h-0.5 origin-left rounded-md bg-editorial-primary"
              />
            )}
          </m.button>
        </div>

        <div className="min-h-[240px] px-6 py-5">
          <AnimatePresence mode="wait" initial={false}>
            {tab === "file" ? (
              <m.div
                key="file"
                variants={fadeSlideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <FileUploadTab spaceId={spaceId} onImported={onImported} />
              </m.div>
            ) : (
              <m.div
                key="url"
                variants={fadeSlideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <UrlPasteTab spaceId={spaceId} onImported={onImported} />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 本地文件上传标签页 ─────────────────────────────────────

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

      // 文件彼此独立，并行上传替代串行 for…of，整体结果仍按输入顺序返回
      let newResults: Array<{
        name: string;
        status: "success" | "error";
        message?: string;
      }> = [];
      try {
        newResults = await Promise.all(
          Array.from(files).map(
            async (
              file,
            ): Promise<{ name: string; status: "success" | "error"; message?: string }> => {
              try {
                const result = await uploadWikiFile(spaceId, file);
                return {
                  name: file.name,
                  status: "success",
                  message: result.title,
                };
              } catch (err) {
                return {
                  name: file.name,
                  status: "error",
                  message: err instanceof Error ? err.message : t("wiki.uploadFailed"),
                };
              }
            },
          ),
        );
      } finally {
        // 无论成败都退出上传态（内层已全量 catch，finally 主要为语义显式）
        setUploading(false);
      }

      setResults(newResults);
      if (newResults.some((r) => r.status === "success")) {
        onImported();
      }
    },
    [spaceId, onImported, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t("wiki.dropFiles")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 ${
          dragOver
            ? "border-editorial-primary bg-editorial-primary/10"
            : "border-editorial-hairline bg-editorial-canvas-soft hover:border-editorial-ink-muted"
        }`}
      >
        {uploading ? (
          <MotionSpinner size={28} className="text-editorial-primary" />
        ) : (
          <Upload size={28} className="text-editorial-ink-muted" strokeWidth={1.5} />
        )}
        <div className="text-center">
          <p className="text-body font-medium text-editorial-ink">
            {uploading ? t("wiki.uploading") : t("wiki.dropFiles")}
          </p>
          <p className="mt-1 text-xs text-editorial-ink-muted">{t("wiki.supportedFormats")}</p>
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
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-xs ${
                r.status === "success"
                  ? "bg-editorial-semantic-success/10 text-editorial-ink"
                  : "bg-editorial-semantic-error/10 text-editorial-semantic-error"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {r.status === "success" ? (
                  <CheckCircle2 size={14} className="shrink-0 text-editorial-semantic-success" />
                ) : (
                  <X size={14} className="shrink-0 text-editorial-semantic-error" />
                )}
                <span className="truncate font-medium" title={r.name}>
                  {r.name}
                </span>
              </div>
              {r.message && (
                <span
                  title={r.message}
                  className={`shrink-0 max-w-[200px] truncate text-xs ${
                    r.status === "success"
                      ? "text-editorial-ink-muted"
                      : "text-editorial-semantic-error font-normal"
                  }`}
                >
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

// ─── 网络链接导入标签页 ─────────────────────────────────────

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

    // URL 逐一建源彼此独立，并行创建替代串行 for…of；结果顺序与输入一致
    let newResults: Array<{
      url: string;
      status: "success" | "error";
      message?: string;
    }> = [];
    try {
      newResults = await Promise.all(
        urlList.map(
          async (url): Promise<{ url: string; status: "success" | "error"; message?: string }> => {
            try {
              await createWikiSource(spaceId, {
                kind: "url",
                title: url,
                content: url,
                metadata: {},
              });
              return { url, status: "success" };
            } catch (err) {
              return {
                url,
                status: "error",
                message: err instanceof Error ? err.message : t("wiki.processFailed"),
              };
            }
          },
        ),
      );
    } finally {
      // 无论成败都退出处理态（内层已全量 catch，finally 主要为语义显式）
      setProcessing(false);
    }

    setResults(newResults);
    if (newResults.some((r) => r.status === "success")) {
      onImported();
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
        <label
          htmlFor="wiki-import-urls"
          className="mb-1.5 block text-body font-medium text-editorial-ink"
        >
          {t("wiki.urlLabel")}
        </label>
        <textarea
          id="wiki-import-urls"
          className="min-h-[100px] w-full resize-none rounded-md border border-editorial-hairline bg-editorial-surface-card p-3 text-body text-editorial-ink placeholder:text-editorial-ink-muted outline-none focus:border-editorial-primary focus:ring-1 focus:ring-editorial-primary"
          placeholder={t("wiki.urlPlaceholder")}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
        {hasError && (
          <p className="mt-1 text-xs text-editorial-semantic-error">{t("wiki.invalidUrls")}</p>
        )}
        {urlList.length > 0 && (
          <p className="mt-1 text-xs text-editorial-ink-muted">
            {t("wiki.urlCount", { count: urlList.length, valid: validUrls.length })}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {urlList.length > 0 && (
          <span className="text-xs text-editorial-ink-muted">
            {t("wiki.willCreate", { count: validUrls.length })}
          </span>
        )}
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={processing || validUrls.length === 0}
          className="h-9 gap-2 rounded-md bg-editorial-primary px-4 text-xs text-editorial-ink-on-primary hover:bg-editorial-primary"
        >
          {processing ? (
            <>
              <MotionSpinner size={14} />
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
          {results.map((r) => (
            <div
              key={r.url}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs ${
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
