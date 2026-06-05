"use client";

import { useState } from "react";
import type { WikiSpaceCreate } from "@feedmind/contracts";
import { createWikiSpace } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreateWikiSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
}

export function CreateWikiSpaceDialog({
  open,
  onClose,
  onCreated,
}: CreateWikiSpaceDialogProps) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const payload: WikiSpaceCreate = {
        name: name.trim(),
        purpose: purpose.trim(),
        template: "general",
        schema: "",
        settings: {
          language: "zh-CN",
          enabledPageTypes: ["entity", "concept", "source", "overview"],
          extraDirs: [],
        },
      };
      const space = await createWikiSpace(payload);
      onCreated(space.id);
      setName("");
      setPurpose("");
    } catch {
      // handled by apiFetch toast
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#d2d2d7] px-6">
          <h2 className="text-[17px] font-semibold text-foreground">
            创建 Wiki 空间
          </h2>
          <button
            className="text-[13px] text-secondary-text hover:text-foreground"
            onClick={onClose}
          >
            取消
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-foreground">名称</span>
            <Input
              id="space-name"
              placeholder="输入空间名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-foreground">描述</span>
            <Textarea
              id="space-purpose"
              placeholder="可选：描述空间的目的"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
            />
          </div>

          <div className="text-[11px] text-secondary-text">
            空间名称将作为标识符，创建后不可更改。
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#d2d2d7] px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </div>
      </div>
    </div>
  );
}
