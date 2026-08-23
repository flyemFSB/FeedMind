import { useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "@/components/ui/toast";
import { Package, Trash2, Upload } from "lucide-react";
import type { SkillRead } from "@feedmind/contracts";
import { listSkills, installSkill, deleteSkill } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listContainerVariants, listItemVariants } from "@/lib/motion";

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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: result, isLoading } = useSkills();
  const skills = result?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.list() });
      toast.add({ title: t("settings.skillDeleted"), type: "success" });
    },
    // 错误由 apiFetch toast 统一提示，避免重复
  });

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        toast.add({ title: t("settings.skillZipOnly"), type: "error" });
        return;
      }

      setInstalling(true);
      try {
        const name = file.name.replace(/\.zip$/i, "");
        await installSkill(name, file);
        void queryClient.invalidateQueries({ queryKey: skillKeys.list() });
        toast.add({ title: t("settings.skillInstalled"), type: "success" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.add({ title: msg, type: "error" });
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
    const file = files[0];
    if (file) void handleFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file) void handleFile(file);
      e.target.value = "";
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-editorial-ink">{t("settings.skills")}</h3>
          <p className="mt-0.5 text-xs text-editorial-ink-muted">
            {t("settings.skillsDescription")}
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <motion.div
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.995 }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 ${
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
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-editorial-surface-soft">
          <Upload size={18} className="text-editorial-ink-muted" />
        </div>
        <div className="text-center">
          <p className="text-body font-medium text-editorial-ink">
            {installing ? t("settings.skillInstalling") : t("settings.skillDropzone")}
          </p>
          <p className="mt-0.5 text-xs text-editorial-ink-muted">
            {t("settings.skillDropzoneHint")}
          </p>
        </div>
      </motion.div>

      {/* Installed skills */}
      {skills.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-editorial-hairline px-6 py-10 text-center">
          <Package size={28} className="text-editorial-ink-muted" />
          <p className="text-body text-editorial-ink-muted">{t("settings.skillEmpty")}</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div
            className="divide-y divide-editorial-hairline overflow-hidden rounded-lg border border-editorial-hairline"
            variants={listContainerVariants}
            initial="initial"
            animate="animate"
          >
            {skills.map((skill) => (
              <motion.div key={skill.name} layout variants={listItemVariants}>
                <SkillRow
                  skill={skill}
                  onDelete={() => setDeleteTarget(skill.name)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === skill.name}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      <DeleteConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        confirming={deleteMutation.isPending && deleteMutation.variables === deleteTarget}
        title={t("settings.deleteSkill")}
        description={
          deleteTarget ? t("settings.skillDeleteConfirm", { name: deleteTarget }) : undefined
        }
      />
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
          <span className="text-body font-medium text-editorial-ink">{skill.name}</span>
          {skill.version && (
            <span className="rounded-md bg-editorial-surface-soft px-1.5 py-0.5 text-xs text-editorial-ink-muted">
              v{skill.version}
            </span>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 text-xs text-editorial-ink-muted">{skill.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-editorial-ink-muted">
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
