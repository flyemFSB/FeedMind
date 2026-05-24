"use client";

import { useState } from "react";
import { CheckCircle2, Clock, FileText, Loader2, Play, RotateCcw, Trash2, Upload, XCircle } from "lucide-react";
import type { WikiSource, WikiSourceDeleteImpact } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createSource, deleteSource, getSourceDeleteImpact, ingestSources, retryJob } from "@/lib/api/wikis";

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

const jobStatusConfig: Record<string, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
  queued: { label: "已排队", variant: "outline" },
  running: { label: "运行中", variant: "default" },
  cancel_requested: { label: "取消中", variant: "outline" },
  completed: { label: "成功", variant: "secondary" },
  failed: { label: "失败", variant: "destructive" },
  canceled: { label: "已取消", variant: "outline" },
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatJobStage(stage?: string | null) {
  if (!stage) return "未知阶段";
  const labels: Record<string, string> = {
    queued: "排队",
    extracting: "提取",
    analyzing: "分析",
    generating: "生成",
    writing: "写入",
    reviewing: "检查",
    completed: "完成",
    failed: "失败",
    canceled: "取消",
  };
  return labels[stage] ?? stage;
}

export function WikiSourceList({ sources, spaceId, onRefresh }: WikiSourceListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState<WikiSource | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<WikiSourceDeleteImpact | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setActiveSourceId(sourceId);
    try {
      await ingestSources(spaceId, [sourceId]);
      onRefresh();
    } finally {
      setActiveSourceId(null);
    }
  }

  async function handleRetry(source: WikiSource) {
    setActiveSourceId(source.id);
    try {
      if (source.lastJobId) {
        await retryJob(spaceId, source.lastJobId);
      } else {
        await ingestSources(spaceId, [source.id]);
      }
      onRefresh();
    } finally {
      setActiveSourceId(null);
    }
  }

  async function openDeleteDialog(source: WikiSource) {
    setDeleteSourceTarget(source);
    setDeleteImpact(null);
    setDeleteError(null);
    setDeleteImpactLoading(true);
    try {
      setDeleteImpact(await getSourceDeleteImpact(spaceId, source.id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "无法获取删除影响范围");
    } finally {
      setDeleteImpactLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteSourceTarget) return;
    setActiveSourceId(deleteSourceTarget.id);
    try {
      await deleteSource(spaceId, deleteSourceTarget.id);
      setDeleteSourceTarget(null);
      setDeleteImpact(null);
      onRefresh();
    } finally {
      setActiveSourceId(null);
    }
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
              const job = source.lastJob;
              const jobCfg = job ? jobStatusConfig[job.status] ?? { label: job.status, variant: "outline" as const } : null;
              const isProcessing = source.status === "analyzing" || source.status === "generating";
              const isBusy = activeSourceId === source.id;
              const canRetry = source.status === "failed" || job?.status === "failed";
              const sourceMeta = [
                `v${source.version}`,
                `${source.relatedPageCount} 个关联页面`,
                formatBytes(source.contentSize),
                source.importKind,
                source.mimeType,
              ];
              return (
                <div key={source.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-[13px] font-medium">{source.filename}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{sourceMeta.join(" · ") || "暂无来源元数据"}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{new Date(source.createdAt).toLocaleString("zh-CN")}</span>
                      {job && jobCfg && (
                        <>
                          <span>最近任务</span>
                          <Badge variant={jobCfg.variant}>{jobCfg.label}</Badge>
                          <span>{formatJobStage(job.stage)}</span>
                        </>
                      )}
                      {!job && source.lastJobId && <span>最近任务 {source.lastJobId}</span>}
                    </div>
                    {(source.errorMessage || job?.errorMessage) && (
                      <p className="truncate text-[11px] text-destructive">{source.errorMessage || job?.errorMessage}</p>
                    )}
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
                    <Button variant="ghost" size="icon-xs" onClick={() => handleIngest(source.id)} disabled={isProcessing || isBusy} title="开始处理">
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    </Button>
                  )}
                  {canRetry && (
                    <Button variant="ghost" size="icon-xs" onClick={() => handleRetry(source)} disabled={isBusy} title="重试">
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-xs" onClick={() => openDeleteDialog(source)} disabled={isProcessing || isBusy} title="删除">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <Dialog open={deleteSourceTarget !== null} onOpenChange={(open) => !open && setDeleteSourceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除来源</DialogTitle>
            <DialogDescription>
              删除后会移除来源记录和页面追溯关系，已生成的 Wiki 页面会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border p-3">
              <p className="truncate text-[13px] font-medium">{deleteSourceTarget?.filename}</p>
              <p className="text-[11px] text-muted-foreground">
                将解除 {deleteImpact?.relatedPageCount ?? deleteSourceTarget?.relatedPageCount ?? 0} 个页面的来源关联
              </p>
            </div>
            {deleteImpactLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在加载影响范围...
              </div>
            ) : deleteError ? (
              <p className="text-[13px] text-destructive">{deleteError}</p>
            ) : deleteImpact && deleteImpact.pages.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {deleteImpact.pages.map((page) => (
                  <div key={page.id} className="border-b p-2 last:border-b-0">
                    <p className="truncate text-[13px] font-medium">{page.title}</p>
                    <p className="text-[11px] text-muted-foreground">{page.type ?? "other"} · {page.updatedAt}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">未发现关联页面，仅删除来源记录。</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={activeSourceId === deleteSourceTarget?.id} />}>取消</DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteImpactLoading || activeSourceId === deleteSourceTarget?.id}>
              {activeSourceId === deleteSourceTarget?.id ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
