import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useCreateWikiPage } from "@/lib/hooks/use-wiki";
import { WIKI_CONCEPT_TYPES } from "@feedmind/contracts";
import { wikiTypeLabel } from "./constants";

interface CreateConceptDialogProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  onCreated: (conceptId: string) => void;
}

interface CreateConceptFormProps {
  spaceId: string;
  onCreated: (conceptId: string) => void;
  onClose: () => void;
}

function CreateConceptForm({ spaceId, onCreated, onClose }: CreateConceptFormProps) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Concept");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useCreateWikiPage(spaceId);

  // 根据标题自动填充路径标识（纯字母/数字/连字符，英文按 slug，中文保留中文）
  const handleTitleChange = (val: string) => {
    setTitle(val);
    const slug = val
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w\u4e00-\u9fa5-]/g, "");
    setPath(slug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const cleanPath = (path.trim() || title.trim()).replace(/\.md$/i, "");
      const res = await createMutation.mutateAsync({
        title: title.trim(),
        type,
        path: cleanPath,
        description: description.trim() || undefined,
        content: `# ${title.trim()}\n\n`,
        tags: [],
        frontmatter: {},
      });

      toast.add({
        title: t("wiki.createConceptSuccess", "概念创建成功"),
        type: "success",
      });
      onCreated(res.concept_id);
      onClose();
    } catch {
      toast.add({
        title: t("wiki.createConceptFailed", "创建概念失败，可能同名概念已存在"),
        type: "error",
      });
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="concept-title" className="text-xs font-medium text-editorial-ink">
          概念标题 <span className="text-editorial-semantic-error">*</span>
        </Label>
        <Input
          id="concept-title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="例如：RAG 检索增强生成架构"
          className="h-9 text-xs rounded-md"
          autoFocus
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="concept-type" className="text-xs font-medium text-editorial-ink">
            知识形态
          </Label>
          <select
            id="concept-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-md border border-editorial-hairline bg-editorial-surface-card px-2.5 text-xs text-editorial-ink focus:border-editorial-accent outline-none"
          >
            {WIKI_CONCEPT_TYPES.map((cType) => (
              <option key={cType} value={cType}>
                {wikiTypeLabel(cType, i18n.language)} ({cType})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="concept-path" className="text-xs font-medium text-editorial-ink">
            文件路径标识 (Slug)
          </Label>
          <Input
            id="concept-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="slug"
            className="h-9 text-xs rounded-md font-mono"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="concept-desc" className="text-xs font-medium text-editorial-ink">
          简述说明 (可选)
        </Label>
        <Input
          id="concept-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简要概括该概念的核心定义"
          className="h-9 text-xs rounded-md"
        />
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-8 rounded-md text-xs"
        >
          {t("common.cancel", "取消")}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || createMutation.isPending}
          className="h-8 rounded-md text-xs"
        >
          {createMutation.isPending
            ? t("common.creating", "创建中...")
            : t("common.create", "立即创建")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateConceptDialog({
  open,
  onClose,
  spaceId,
  onCreated,
}: CreateConceptDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-editorial-surface-card border-editorial-hairline p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-serif font-bold text-editorial-ink">
            {t("wiki.newConcept", "新建 Wiki 概念")}
          </DialogTitle>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            {t("wiki.newConceptDesc", "在当前知识库空间中开辟一个新概念页面。")}
          </DialogDescription>
        </DialogHeader>

        {open && <CreateConceptForm spaceId={spaceId} onCreated={onCreated} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
