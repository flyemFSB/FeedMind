"use client";

import { useState } from "react";
import type { WikiSpaceCreate } from "@feedmind/contracts";
import { createWikiSpace } from "@/lib/api/wiki";
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-w-md gap-0 rounded-2xl bg-white p-0 text-[#1d1d1f] sm:max-w-md">
        <DialogHeader className="flex h-[72px] shrink-0 flex-row items-center justify-between border-b border-[#d2d2d7] px-6">
          <DialogTitle className="text-[17px] font-semibold">创建 Wiki 空间</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="space-name" className="text-[13px] font-medium">名称</Label>
            <Input
              id="space-name"
              placeholder="输入空间名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="space-purpose" className="text-[13px] font-medium">描述</Label>
            <Textarea
              id="space-purpose"
              placeholder="可选：描述空间的目的"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
            />
          </div>

          <div className="text-[11px] text-[#86868b]">
            空间名称将作为标识符，创建后不可更改。
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-2xl border-t border-[#d2d2d7] bg-white px-6 py-4">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
