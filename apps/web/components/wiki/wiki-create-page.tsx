"use client";

import { useState } from "react";
import type { WikiPageCreate } from "@feedmind/contracts";
import { wikiPageTypeSchema } from "@feedmind/contracts";
import { createWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WikiPageType } from "@feedmind/contracts";

interface CreateWikiPageDialogProps {
  open: boolean;
  spaceId: string;
  onClose: () => void;
  onCreated: (pageId: string) => void;
}

export function CreateWikiPageDialog({
  open,
  spaceId,
  onClose,
  onCreated,
}: CreateWikiPageDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WikiPageType>("concept");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const payload: WikiPageCreate = {
        title: title.trim(),
        type,
        path: `wiki/${title.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-一-鿿]/g, "")}.md`,
        content: `# ${title.trim()}\n\n`,
        sources: [],
        tags: [],
        related: [],
      };
      const page = await createWikiPage(spaceId, payload);
      onCreated(page.id);
      setTitle("");
      setType("concept");
    } catch {
      // handled by apiFetch toast
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f] sm:max-w-sm">
        <DialogHeader className="border-b border-[#e8e8ed] px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold">新建页面</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="page-title" className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">标题</Label>
            <Input
              id="page-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="页面标题"
              autoFocus
              className="h-9 rounded-lg border-[#d2d2d7] text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="page-type" className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">类型</Label>
            <Select value={type} onValueChange={(v: WikiPageType | null) => { if (v) setType(v); }}>
              <SelectTrigger id="page-type" className="h-9 rounded-lg border-[#d2d2d7] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-[#d2d2d7]">
                {wikiPageTypeSchema.options.map((t) => (
                  <SelectItem key={t} value={t} className="text-[13px]">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#e8e8ed] bg-white px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg text-[13px]">
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="rounded-lg bg-[#0071e3] text-[13px] text-white hover:bg-[#0066cc]"
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
