"use client";

import { useState } from "react";
import type { WikiPageCreate } from "@feedmind/contracts";
import { wikiPageTypeSchema } from "@feedmind/contracts";
import { createWikiPage } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [type, setType] = useState<string>("concept");
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const payload: WikiPageCreate = {
        title: title.trim(),
        type: type as any,
        path: `wiki/${title.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-一-鿿]/g, "")}.md`,
        content: `# ${title.trim()}\n\n`,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#d2d2d7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#e8e8ed] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">新建页面</h2>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
              标题
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="页面标题"
              autoFocus
              className="h-9 rounded-lg border-[#d2d2d7] text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
              类型
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 rounded-lg border-[#d2d2d7] text-[13px]">
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

        <div className="flex justify-end gap-2 border-t border-[#e8e8ed] px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-lg text-[13px]"
          >
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
        </div>
      </div>
    </div>
  );
}
