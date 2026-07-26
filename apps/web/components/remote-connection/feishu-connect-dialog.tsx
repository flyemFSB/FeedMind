"use client";

import { useState, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Check, Eye, EyeOff, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { fadeSlideVariants, motionSpring } from "@/lib/motion";
import { toast } from "sonner";

interface FeishuConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type Step = "loading" | "config" | "showConfig" | "done";

/**
 * FeishuConnectDialog — 飞书机器人接入弹窗
 * 未配置时显示表单填写 App ID/Secret，已配置时显示凭据信息
 */
export function FeishuConnectDialog({ open, onClose, onConnected }: FeishuConnectDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [storedAppId, setStoredAppId] = useState("");
  const [storedAppSecret, setStoredAppSecret] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setSecretVisible(false);
    fetch("/api/v1/remote-connections/feishu/status")
      .then((r) => r.json())
      .then((res) => {
        if (res.data?.configured) {
          setStoredAppId(res.data.config?.appId ?? "");
          setStoredAppSecret(res.data.config?.appSecret ?? "");
          setStep("showConfig");
        } else {
          setStep("config");
        }
      })
      .catch(() => setStep("config"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} 已复制`));
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
        className="w-full max-w-[400px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-editorial-hairline px-5 py-4">
          <DialogTitle className="text-[14px] font-semibold text-editorial-ink">
            连接飞书机器人
          </DialogTitle>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="rounded-md hover:bg-editorial-surface-soft"
            aria-label="关闭"
            title="关闭"
          >
            <X size={16} className="text-editorial-ink-muted" />
          </Button>
        </div>

        <div className="min-h-[280px]">
          <AnimatedStep step={step}>
            {step === "loading" && (
              <div className="flex justify-center py-12">
                <MotionSpinner size={22} className="text-editorial-ink-muted" />
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
                      className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-ink"
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
                      className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none focus:border-editorial-ink"
                    />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
                  {saving ? <MotionSpinner size={14} /> : <Check size={14} />}
                  接入机器人
                </Button>
              </div>
            )}

            {step === "showConfig" && (
              <div className="space-y-4 px-5 py-5">
                <p className="text-[13px] leading-relaxed text-editorial-ink-soft">
                  飞书机器人已配置，凭据信息如下：
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-editorial-ink">
                      App ID
                    </label>
                    <div className="relative">
                      <input
                        value={storedAppId}
                        readOnly
                        className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-9 text-[13px] text-editorial-ink outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(storedAppId, "App ID")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                      >
                        <Copy size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-editorial-ink">
                      App Secret
                    </label>
                    <div className="relative">
                      <input
                        type={secretVisible ? "text" : "password"}
                        value={storedAppSecret}
                        readOnly
                        className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-14 text-[13px] text-editorial-ink outline-none"
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSecretVisible(!secretVisible)}
                          className="rounded-md p-1 text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                        >
                          {secretVisible ? (
                            <EyeOff size={14} strokeWidth={1.7} />
                          ) : (
                            <Eye size={14} strokeWidth={1.7} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(storedAppSecret, "App Secret")}
                          className="rounded-md p-1 text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                        >
                          <Copy size={14} strokeWidth={1.7} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setStep("config")}
                  variant="outline"
                  className="w-full gap-1.5"
                >
                  重新配置
                </Button>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center gap-3 rounded-lg bg-editorial-semantic-success/10 px-4 py-3">
                  <motion.svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={motionSpring}
                  >
                    <motion.polyline
                      points="20 6 9 17 4 12"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </motion.svg>
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
                    <code className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[12px]">
                      im.message.receive_v1
                    </code>
                    ，申请权限{" "}
                    <code className="rounded bg-editorial-surface-strong px-1.5 py-0.5 text-[12px]">
                      im:message:send_as_bot
                    </code>
                    ，发布后 FeedMind 会自动通过 WebSocket 连接飞书服务器。
                  </p>
                </div>
              </div>
            )}
          </AnimatedStep>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnimatedStep({ step, children }: { step: Step; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        variants={fadeSlideVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
