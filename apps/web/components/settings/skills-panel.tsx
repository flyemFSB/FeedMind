"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Package, Trash2, Upload } from "lucide-react";
import type { SkillRead } from "@feedmind/contracts";
import { listSkills, installSkill, deleteSkill } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const skillKeys = {
  all: ["skills"] as const,
  list: () => [...skillKeys.all, "list"] as const,
};

function useSkills() {
  return useQuery({
    queryKey: skillKeys.list(),
    queryFn: ({ signal }) => listSkills(signal),
    staleTime: Infinity,
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

export function SkillsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [installing, setInstalling] = useState(false);

  const { data: result, isLoading } = useSkills();
  const skills = result?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: skillKeys.list() });
      toast.success(t("settings.skillDeleted"));
    },
    onError: () => toast.error(t("settings.deleteFailed")),
  });

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        toast.error(t("settings.skillZipOnly"));
        return;
      }

      setInstalling(true);
      try {
        const name = file.name.replace(/\.zip$/i, "");
        await installSkill(name, file);
        queryClient.invalidateQueries({ queryKey: skillKeys.list() });
        toast.success(t("settings.skillInstalled"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(msg);
      } finally {
        setInstalling(false);
      }
    },
    [queryClient, t],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
      e.target.value = "";
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-editorial-ink">{t("settings.skills")}</h3>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("settings.skillsDescription")}
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
          dragOver
            ? "border-editorial-primary bg-editorial-primary/5"
            : "border-editorial-hairline hover:border-editorial-primary/40 hover:bg-editorial-surface-soft"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-editorial-surface-soft">
          <Upload size={18} className="text-editorial-ink-muted" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-editorial-ink">
            {installing ? t("settings.skillInstalling") : t("settings.skillDropzone")}
          </p>
          <p className="mt-0.5 text-[11px] text-editorial-ink-muted">
            {t("settings.skillDropzoneHint")}
          </p>
        </div>
      </div>

      {/* Installed skills */}
      {skills.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-editorial-hairline px-6 py-10 text-center">
          <Package size={28} className="text-editorial-ink-muted" />
          <p className="text-[13px] text-editorial-ink-muted">{t("settings.skillEmpty")}</p>
        </div>
      ) : (
        <div className="divide-y divide-editorial-hairline overflow-hidden rounded-xl border border-editorial-hairline">
          {skills.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              onDelete={() => {
                if (confirm(t("settings.skillDeleteConfirm")?.replace("{name}", skill.name))) {
                  deleteMutation.mutate(skill.name);
                }
              }}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === skill.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillRow({
  skill,
  onDelete,
  isDeleting,
}: {
  skill: SkillRead;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-editorial-surface-soft">
        <Package size={15} className="text-editorial-ink-soft" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-editorial-ink">{skill.name}</span>
          {skill.version && (
            <span className="rounded-md bg-editorial-surface-soft px-1.5 py-0.5 text-[10px] text-editorial-ink-muted">
              v{skill.version}
            </span>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">{skill.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-editorial-ink-muted">
          <span>{formatSize(skill.size)}</span>
          {skill.author && <span>{skill.author}</span>}
          <span>{formatDate(skill.installed_at)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={isDeleting}
        className="mt-0.5 h-8 w-8 shrink-0 rounded-lg text-editorial-ink-muted hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
