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
import { useTranslation } from "react-i18next";

interface CreateWikiSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (spaceId: string, spaceName: string) => void;
}

export function CreateWikiSpaceDialog({ open, onClose, onCreated }: CreateWikiSpaceDialogProps) {
  const { t } = useTranslation();
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
          enabledPageTypes: [],
          extraDirs: [],
        },
      };
      const space = await createWikiSpace(payload);
      onCreated(space.id, space.name);
      setName("");
      setPurpose("");
    } catch {
      // 错误由 apiFetch toast 统一提示
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 rounded-lg bg-editorial-surface-card p-0 text-editorial-ink sm:max-w-md"
      >
        <DialogHeader className="flex h-[72px] shrink-0 flex-row items-center justify-between border-b border-editorial-hairline px-6">
          <DialogTitle className="text-[16px] font-semibold">
            {t("wiki.createWikiSpace")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="space-name" className="text-[13px] font-medium">
              {t("wiki.name")}
            </Label>
            <Input
              id="space-name"
              placeholder={t("wiki.spaceNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="space-purpose" className="text-[13px] font-medium">
              {t("wiki.description")}
            </Label>
            <Textarea
              id="space-purpose"
              placeholder={t("wiki.descriptionPlaceholder")}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
            />
          </div>

          <div className="text-[12px] text-editorial-ink-muted">{t("wiki.spaceNameNote")}</div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-lg border-t border-editorial-hairline bg-editorial-surface-card px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || creating}
          >
            {creating ? t("wiki.creating") : t("wiki.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
