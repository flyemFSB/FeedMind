import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscardChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}

/** 放弃未保存修改的二次确认：编辑器「取消」与「切换概念」共用同一份文案与动作 */
export function DiscardChangesDialog({ open, onOpenChange, onDiscard }: DiscardChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-editorial-hairline bg-editorial-surface-card p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-editorial-ink">
            {t("wiki.discardChangesTitle", "放弃未保存的修改？")}
          </DialogTitle>
          <DialogDescription className="text-xs text-editorial-ink-muted">
            {t(
              "wiki.discardChangesDesc",
              "当前页面存在未保存的编辑内容，离开将丢失更改。确定要放弃吗？",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-md text-xs"
          >
            {t("wiki.continueEditing", "继续编辑")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onDiscard();
            }}
            className="h-8 rounded-md text-xs"
          >
            {t("wiki.discardAndLeave", "放弃并离开")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
