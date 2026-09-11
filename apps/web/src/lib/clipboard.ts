import { toast } from "@/components/ui/toast";

/** 复制文本并 toast 成功提示；剪贴板不可用时静默降级（用户可手动复制） */
export async function copyText(text: string, successMessage: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: successMessage, type: "success" });
  } catch {
    // 剪贴板权限/可用性失败时忽略
  }
}
