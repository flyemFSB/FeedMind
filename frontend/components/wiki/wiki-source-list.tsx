"use client";

import { useState } from "react";
import { CheckCircle2, Clock, FileText, Loader2, Play, Trash2, Upload, XCircle } from "lucide-react";
import type { WikiSource } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSource, deleteSource, ingestSources } from "@/lib/api/wiki";

interface WikiSourceListProps {
  sources: WikiSource[];
  spaceId: string;
  onRefresh: () => void;
}

const statusConfig: Record<string, { icon: typeof Loader2; label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
  pending: { icon: Clock, label: "待处理", variant: "outline" },
  analyzing: { icon: Loader2, label: "分析中", variant: "default" },
  generating: { icon: Loader2, label: "生成中", variant: "default" },
  completed: { icon: CheckCircle2, label: "已完成", variant: "secondary" },
  failed: { icon: XCircle, label: "失败", variant: "destructive" },
};

export function WikiSourceList({ sources, spaceId, onRefresh }: WikiSourceListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await createSource(spaceId, file.name, await file.text());
      onRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await createSource(spaceId, `clipboard-${Date.now()}.md`, text);
      onRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleIngest(sourceId: string) {
    await ingestSources(spaceId, [sourceId]);
    onRefresh();
  }

  async function handleDelete(sourceId: string) {
    await deleteSource(spaceId, sourceId);
    onRefresh();
  }

  async function handleIngestAll() {
    await ingestSources(spaceId, sources.filter((source) => source.status === "pending").map((source) => source.id));
    onRefresh();
  }

  const pendingCount = sources.filter((s) => s.status === "pending").length;

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>上传来源</CardTitle>
          <CardDescription>支持 .md、.txt、.json 等文本文件，LLM 将自动分析并生成 Wiki 页面</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={uploading} className="relative">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload data-icon="inline-start" />}
              {uploading ? "上传中..." : "选择文件"}
              <input type="file" accept=".md,.txt,.json,.csv,.yaml,.yml,.xml,.html" className="absolute inset-0 cursor-pointer opacity-0" onChange={handleFileUpload} disabled={uploading} />
            </Button>
            <Input type="text" placeholder="或粘贴文本内容..." className="flex-1" onPaste={handlePaste} />
          </div>
          {uploadError && <p className="mt-2 text-[12px] text-destructive">{uploadError}</p>}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>来源文件</CardTitle>
            <CardDescription>{sources.length} 个来源，{pendingCount} 个待处理</CardDescription>
          </div>
          {pendingCount > 0 && (
            <Button size="sm" onClick={handleIngestAll}>
              <Play data-icon="inline-start" />
              处理全部 ({pendingCount})
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sources.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">暂无来源，上传文件或粘贴内容后 LLM 将自动生成 Wiki 页面</p>
          ) : (
            sources.map((source) => {
              const cfg = statusConfig[source.status] ?? statusConfig.pending;
              const Icon = cfg.icon;
              const isProcessing = source.status === "analyzing" || source.status === "generating";
              return (
                <div key={source.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{source.filename}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {source.pageCount > 0 ? `${source.pageCount} 个页面 · ` : ""}
                      {new Date(source.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <Badge variant={cfg.variant}>
                    {source.status === "analyzing" || source.status === "generating" ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Icon className="mr-1 size-3" />
                    )}
                    {cfg.label}
                  </Badge>
                  {source.status === "pending" && (
                    <Button variant="ghost" size="icon-xs" onClick={() => handleIngest(source.id)} disabled={isProcessing} title="开始处理">
                      <Play className="size-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(source.id)} disabled={isProcessing} title="删除">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
