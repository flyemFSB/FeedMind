"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  File,
  FileText,
  Globe,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { uploadWikiFile } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Props ────────────────────────────────────────────────────

interface WikiImportDialogProps {
  open: boolean;
  spaceId: string;
  onClose: () => void;
  onImported: () => void;
}

type ImportTab = "file" | "url";

// ─── Component ─────────────────────────────────────────────────

export function WikiImportDialog({
  open,
  spaceId,
  onClose,
  onImported,
}: WikiImportDialogProps) {
  const [tab, setTab] = useState<ImportTab>("file");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-4">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
            导入内容
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e8e8ed] px-6">
          <TabButton
            label="上传文件"
            icon={FileText}
            active={tab === "file"}
            onClick={() => setTab("file")}
          />
          <TabButton
            label="粘贴链接"
            icon={Globe}
            active={tab === "url"}
            onClick={() => setTab("url")}
          />
        </div>

        {/* Content */}
        <div className="min-h-[240px] px-6 py-5">
          {tab === "file" ? (
            <FileUploadTab spaceId={spaceId} onImported={onImported} />
          ) : (
            <UrlPasteTab spaceId={spaceId} onImported={onImported} />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#e8e8ed] px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-lg text-[13px] text-[#86868b]"
          >
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Button ────────────────────────────────────────────────

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
        active
          ? "border-[#0071e3] text-[#0071e3]"
          : "border-transparent text-[#86868b] hover:text-[#1d1d1f]"
      }`}
    >
      <Icon size={15} strokeWidth={1.6} />
      {label}
    </button>
  );
}

// ─── File Upload Tab ───────────────────────────────────────────

const ACCEPTED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "text/markdown",
  "text/plain",
  ".md",
];

function FileUploadTab({
  spaceId,
  onImported,
}: {
  spaceId: string;
  onImported: () => void;
}) {
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
            message: err instanceof Error ? err.message : "上传失败",
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? "border-[#0071e3] bg-[#e8f0fe]"
            : "border-[#d2d2d7] bg-[#fafafc] hover:border-[#86868b]"
        }`}
      >
        {uploading ? (
          <Loader2 size={28} className="animate-spin text-[#0071e3]" />
        ) : (
          <Upload size={28} className="text-[#86868b]" strokeWidth={1.5} />
        )}
        <div className="text-center">
          <p className="text-[13px] font-medium text-[#1d1d1f]">
            {uploading ? "上传中..." : "点击或拖拽文件到此处"}
          </p>
          <p className="mt-1 text-[11px] text-[#86868b]">
            支持 .md .docx .xlsx .pptx 格式
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.docx,.xlsx,.pptx,text/markdown,text/plain"
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
                  ? "bg-[#f0faf0] text-[#1d1d1f]"
                  : "bg-[#fff5f5] text-[#ff3b30]"
              }`}
            >
              {r.status === "success" ? (
                <CheckCircle2 size={14} className="shrink-0 text-[#34c759]" />
              ) : (
                <X size={14} className="shrink-0 text-[#ff3b30]" />
              )}
              <span className="truncate font-medium">{r.name}</span>
              {r.message && (
                <span className="ml-auto shrink-0 text-[10px] text-[#86868b]">
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

function UrlPasteTab({
  spaceId,
  onImported,
}: {
  spaceId: string;
  onImported: () => void;
}) {
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

    const { createWikiSource } = await import("@/lib/api/wiki");
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
          message: err instanceof Error ? err.message : "处理失败",
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
        <label className="mb-1.5 block text-[13px] font-medium text-[#1d1d1f]">
          输入 URL 链接
        </label>
        <textarea
          className="min-h-[100px] w-full resize-none rounded-xl border border-[#d2d2d7] bg-white p-3 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] outline-none transition-colors focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]"
          placeholder={"粘贴链接，每行一个...\n例如：\nhttps://example.com/article"}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
        {hasError && (
          <p className="mt-1 text-[11px] text-[#ff3b30]">
            部分链接格式不正确，将被跳过
          </p>
        )}
        {urlList.length > 0 && (
          <p className="mt-1 text-[11px] text-[#86868b]">
            共 {urlList.length} 个链接，{validUrls.length} 个有效
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={processing || validUrls.length === 0}
          className="h-9 gap-2 rounded-lg bg-[#0071e3] px-4 text-[12px] text-white hover:bg-[#0066cc]"
        >
          {processing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Globe size={14} />
              开始处理
            </>
          )}
        </Button>
        {urlList.length > 0 && (
          <span className="text-[11px] text-[#86868b]">
            将创建 {validUrls.length} 个来源
          </span>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="max-h-[120px] space-y-1 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] ${
                r.status === "success"
                  ? "bg-[#f0faf0] text-[#1d1d1f]"
                  : "bg-[#fff5f5] text-[#ff3b30]"
              }`}
            >
              {r.status === "success" ? (
                <CheckCircle2 size={14} className="shrink-0 text-[#34c759]" />
              ) : (
                <X size={14} className="shrink-0 text-[#ff3b30]" />
              )}
              <span className="truncate">{r.url}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
