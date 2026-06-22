"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Check } from "lucide-react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FeishuConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type Step = "loading" | "config" | "qr" | "done";

/**
 * FeishuConnectDialog — 飞书机器人接入弹窗
 * 未配置时显示表单填写 App ID/Secret，已配置时显示应用安装二维码
 */
export function FeishuConnectDialog({ open, onClose, onConnected }: FeishuConnectDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const showQr = useCallback(async (id: string) => {
    setStep("qr");
    const installUrl = `https://app.feishu.cn/client/entrance/open?app_id=${id}`;
    QRCode.toDataURL(installUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#292524", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setQrDataUrl(null);
    fetch("/api/v1/remote-connections/feishu/status")
      .then((r) => r.json())
      .then((res) => {
        if (res.data?.configured) {
          showQr(res.data.config?.appId ?? "");
        } else {
          setStep("config");
        }
      })
      .catch(() => setStep("config"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showQr]);

  const handleSave = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      toast.error("App ID 和 App Secret 不能为空");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/remote-connections/feishu/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }
      toast.success("凭证验证通过");
      setStep("done");
      onConnected();
      setTimeout(() => onClose(), 1000);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
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
        className="w-full max-w-[400px] gap-0 overflow-hidden rounded-2xl bg-editorial-surface-card p-0 text-editorial-ink shadow-lg ring-1 ring-black/5"
      >
        <div className="flex items-center justify-between border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold text-editorial-ink">
            连接飞书机器人
          </DialogTitle>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="rounded-lg hover:bg-editorial-surface-soft"
          >
            <X size={16} className="text-editorial-ink-muted" />
          </Button>
        </div>

        {step === "loading" && (
          <div className="flex justify-center py-12">
            <Loader2 size={22} className="animate-spin text-editorial-ink-muted" />
          </div>
        )}

        {step === "config" && (
          <div className="space-y-4 px-5 py-5">
            <p className="text-[13px] leading-relaxed text-editorial-ink-soft">
              在
              <a
                href="https://open.feishu.cn/app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-editorial-ink"
              >
                飞书开发者后台
              </a>
              创建应用→开启机器人能力→发布，将凭证填入：
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-editorial-ink">
                  App ID
                </label>
                <input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="cli_xxxxxxxx"
                  className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-editorial-ink">
                  App Secret
                </label>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="输入 App Secret"
                  className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink"
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              接入机器人
            </Button>
          </div>
        )}

        {step === "qr" && (
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt=""
                width={240}
                height={240}
                className="rounded-xl ring-1 ring-editorial-hairline"
              />
            ) : (
              <div className="flex h-[240px] w-[240px] items-center justify-center rounded-xl bg-editorial-surface-soft text-[12px] text-editorial-ink-muted">
                生成中...
              </div>
            )}
            <p className="text-center text-[12px] leading-relaxed text-editorial-ink-soft">
              用飞书扫描二维码添加机器人到通讯录，或在群聊中搜索添加
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-3 rounded-xl bg-editorial-semantic-success/10 px-4 py-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[13px] font-medium text-editorial-semantic-success">
                凭证验证通过
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-editorial-ink">下一步：开启长连接</p>
              <p className="text-[12px] leading-relaxed text-editorial-ink-soft">
                在
                <a
                  href="https://open.feishu.cn/app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-editorial-ink"
                >
                  飞书开发者后台
                </a>{" "}
                → 事件与回调 → 配置方式中，选择{" "}
                <strong className="text-editorial-ink">使用长连接接收事件</strong>。
              </p>
              <p className="text-[12px] leading-relaxed text-editorial-ink-soft">
                添加事件{" "}
                <code className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[11px]">
                  im.message.receive_v1
                </code>
                ，申请权限{" "}
                <code className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[11px]">
                  im:message:send_as_bot
                </code>
                ，发布后 FeedMind 会自动通过 WebSocket 连接飞书服务器。
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
