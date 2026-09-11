import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "motion/react";
import { Check, Eye, EyeOff, Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { fadeSlideVariants, motionSpring } from "@/lib/motion";
import { toast } from "@/components/ui/toast";
import { apiFetch, apiPost, backendApiPath } from "@/lib/api/client";
import i18n from "@/lib/i18n";

interface FeishuConfigPanelProps {
  onConnected: () => void;
}

type Step = "loading" | "config" | "showConfig" | "done";

interface FeishuStatus {
  configured: boolean;
  connected: boolean;
  config: { appId: string } | null;
}

// 状态查询在保存/重配置间共享，key 提出来供失效使用
const feishuStatusKey = ["remote-connections", "feishu", "status"] as const;

/**
 * FeishuConfigPanel — 飞书机器人接入面板（内嵌于远程连接弹窗）
 * 未配置时显示扫码/手动双 tab，已配置时显示凭据信息
 */
export function FeishuConfigPanel({ onConnected }: FeishuConfigPanelProps) {
  const { t } = useTranslation();
  // 短别名，避免重复书写完整命名空间路径
  const fp = (key: string) => t(`remoteConnection.feishuPanel.${key}`);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("loading");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [storedAppId, setStoredAppId] = useState("");
  const [storedAppSecret, setStoredAppSecret] = useState("");
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [scanState, setScanState] = useState<"idle" | "waiting">("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [scanError, setScanError] = useState("");
  const scanRef = useRef<{ deviceCode: string; interval: number } | null>(null);
  // 保存成功后 1s 从「凭证验证通过」过渡到凭据展示，卸载时需清理避免对已卸载组件 setState
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  const feishuStatusQuery = useQuery({
    queryKey: feishuStatusKey,
    queryFn: () => apiFetch<FeishuStatus>(backendApiPath("/remote-connections/feishu/status")),
  });
  const feishuStatus = feishuStatusQuery.data;
  // 渲染期按查询结果推进状态机（React 官方模式，替代 effect 内取数 + setState）：
  // 查询失败同样落到手填表单，与原 catch 行为一致
  if (step === "loading") {
    if (feishuStatus) {
      setStep(feishuStatus.configured ? "showConfig" : "config");
      setStoredAppId(feishuStatus.config?.appId ?? "");
      // 接口不回传 secret（不外泄），展示态由用户重输入或保持为空
      setStoredAppSecret("");
    } else if (feishuStatusQuery.isError) {
      setStep("config");
    }
  }

  const saveConfig = async (id: string, secret: string) => {
    setSaving(true);
    try {
      // 统一走 apiFetch：错误由信封 message 透传 toast（含网络失败），
      // 避免手写 fetch 只落一句模糊的「保存失败」
      await apiPost("/remote-connections/feishu/config", {
        appId: id.trim(),
        appSecret: secret.trim(),
      });
      toast.add({ title: fp("verificationPassed"), type: "success" });
      setStoredAppId(id.trim());
      setStoredAppSecret(secret.trim());
      setStep("done");
      onConnected();
      // 凭据已变更，失效状态查询让面板下次进入拿到最新配置
      void queryClient.invalidateQueries({ queryKey: feishuStatusKey });
      doneTimerRef.current = setTimeout(() => setStep("showConfig"), 1000);
      return true;
    } catch {
      // apiFetch 已 toast 具体错误，此处只返回失败状态
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.add({ title: `${label} ${fp("copiedSuffix")}`, type: "success" }))
      .catch(() => toast.add({ title: t("settings.copyFailed"), type: "error" }));
  };

  const handleSave = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      toast.add({ title: fp("emptyCredentials"), type: "error" });
      return;
    }
    await saveConfig(appId, appSecret);
  };

  const beginScan = async () => {
    setScanState("waiting");
    setScanError("");
    try {
      // 统一走 apiFetch：网络失败/业务错误由信封 message 透传 toast，
      // 不再把 fetch 英文异常（"Failed to fetch"）展示在扫码区
      const data = await apiPost<{
        deviceCode: string;
        qrUrl: string;
        interval: number;
        expireIn: number;
      }>("/remote-connections/feishu/register/begin", {});
      scanRef.current = { deviceCode: data.deviceCode, interval: data.interval };
      setQrUrl(data.qrUrl);
    } catch (err) {
      // setScanError 非空以阻断下方 useEffect 的自动重试循环；
      // 具体原因已由 apiFetch toast 提示
      setScanState("idle");
      setScanError(err instanceof Error ? err.message : fp("createSessionFailed"));
    }
  };

  // 进入扫码 tab 直接展示二维码
  useEffect(() => {
    if (step === "config" && mode === "scan" && scanState === "idle" && !scanError) {
      void beginScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, scanState, scanError]);

  useEffect(() => {
    if (!qrUrl || !scanRef.current) return;
    const { deviceCode, interval } = scanRef.current;
    // 轮询 tick 里的 await 可能晚于 cleanup 返回（effect 重跑/卸载），
    // 置位后丢弃陈旧响应，避免上一个会话的响应写坏新会话状态
    let cancelled = false;
    const timer = setInterval(
      () => {
        void (async () => {
          try {
            // apiPost 统一检查 res.ok 与信封错误，网络抖动抛错后由下方 catch 继续轮询
            const data = await apiPost<{
              status: "pending" | "success" | "error";
              appId?: string;
              appSecret?: string;
              error?: string;
              errorCode?: string;
            }>("/remote-connections/feishu/register/poll", { deviceCode });
            if (cancelled) return;
            if (data.status === "success") {
              clearInterval(timer);
              scanRef.current = null;
              const ok = await saveConfig(data.appId ?? "", data.appSecret ?? "");
              if (!ok && !cancelled) {
                setScanState("idle");
                setScanError(fp("saveFailed"));
              }
            } else if (data.status === "error") {
              clearInterval(timer);
              scanRef.current = null;
              setScanState("idle");
              // 按飞书错误码查词条（scanErrors.*），未知码回退后端中文消息（defaultValue）
              const errText = data.error ?? fp("authFailed");
              setScanError(
                i18n.t(`remoteConnection.feishuPanel.scanErrors.${data.errorCode}`, {
                  defaultValue: errText,
                }),
              );
            }
          } catch {
            /* 网络抖动继续轮询 */
          }
        })();
      },
      Math.max(interval, 3) * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrUrl]);

  return (
    <div className="space-y-4">
      <AnimatedStep step={step}>
        {step === "loading" && (
          <div className="flex justify-center py-6">
            <MotionSpinner size={20} className="text-editorial-ink-muted" />
          </div>
        )}

        {step === "config" && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-editorial-ink-soft">
              {fp("connectedDesc")}
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-editorial-surface-strong p-1">
              {(
                [
                  ["scan", fp("scanTab")],
                  ["manual", fp("manualTab")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
                    mode === value
                      ? "bg-editorial-surface-card text-editorial-ink shadow-sm"
                      : "text-editorial-ink-muted hover:text-editorial-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "scan" ? (
              <div className="space-y-3">
                {scanState === "idle" ? (
                  scanError ? (
                    <div className="space-y-3">
                      <p className="rounded-lg bg-editorial-semantic-error/10 px-3 py-2 text-xs text-editorial-semantic-error">
                        {scanError}
                      </p>
                      <Button
                        onClick={() => void beginScan()}
                        variant="outline"
                        className="w-full gap-1.5"
                      >
                        <QrCode size={14} />
                        {fp("qrRegenerate")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-center py-4">
                      <MotionSpinner size={18} className="text-editorial-ink-muted" />
                    </div>
                  )
                ) : (
                  <>
                    <div className="flex justify-center rounded-lg border border-editorial-hairline-strong bg-white p-4">
                      <QRCodeSVG value={qrUrl} size={176} marginSize={1} />
                    </div>
                    <p className="text-center text-xs leading-relaxed text-editorial-ink-soft">
                      {fp("scanHint1")}
                      <br />
                      {fp("scanHint2")}
                    </p>
                    <Button
                      onClick={() => void beginScan()}
                      variant="ghost"
                      className="w-full text-xs text-editorial-ink-muted"
                    >
                      {fp("qrExpired")}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="text-body leading-relaxed text-editorial-ink-soft">
                  {fp("manualHintIntro")}
                  <a
                    href="https://open.feishu.cn/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-editorial-ink"
                  >
                    {fp("manualHintLink")}
                  </a>
                  {fp("manualHintOutro")}
                </p>
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="feishu-config-app-id"
                      className="mb-1 block text-xs font-medium text-editorial-ink"
                    >
                      {fp("appId")}
                    </label>
                    <input
                      id="feishu-config-app-id"
                      value={appId}
                      onChange={(e) => setAppId(e.target.value)}
                      placeholder="cli_xxxxxxxx"
                      className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-body text-editorial-ink outline-none focus:border-editorial-ink"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="feishu-config-app-secret"
                      className="mb-1 block text-xs font-medium text-editorial-ink"
                    >
                      {fp("appSecret")}
                    </label>
                    <input
                      id="feishu-config-app-secret"
                      type="password"
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value)}
                      placeholder={fp("appSecretPlaceholder")}
                      className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-body text-editorial-ink outline-none focus:border-editorial-ink"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="w-full gap-1.5"
                >
                  {saving ? <MotionSpinner size={14} /> : <Check size={14} />}
                  {fp("connectButton")}
                </Button>
              </>
            )}
          </div>
        )}

        {step === "showConfig" && (
          <div className="space-y-3">
            <p className="text-body leading-relaxed text-editorial-ink-soft">
              {fp("configuredTitle")}
            </p>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="feishu-show-app-id"
                  className="mb-1 block text-xs font-medium text-editorial-ink"
                >
                  {fp("appId")}
                </label>
                <div className="relative">
                  <input
                    id="feishu-show-app-id"
                    value={storedAppId}
                    readOnly
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-9 text-body text-editorial-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(storedAppId, fp("appId"))}
                    aria-label={fp("copyAppId")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                  >
                    <Copy size={14} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="feishu-show-app-secret"
                  className="mb-1 block text-xs font-medium text-editorial-ink"
                >
                  {fp("appSecret")}
                </label>
                <div className="relative">
                  <input
                    id="feishu-show-app-secret"
                    type={secretVisible ? "text" : "password"}
                    value={storedAppSecret}
                    readOnly
                    className="w-full rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 pr-14 text-body text-editorial-ink outline-none"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => setSecretVisible(!secretVisible)}
                      aria-label={fp("toggleSecret")}
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
                      onClick={() => handleCopy(storedAppSecret, fp("appSecret"))}
                      aria-label={fp("copyAppSecret")}
                      className="rounded-md p-1 text-editorial-ink-muted hover:bg-editorial-surface-soft hover:text-editorial-ink"
                    >
                      <Copy size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => setStep("config")} variant="outline" className="w-full gap-1.5">
              {fp("reconfigure")}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex items-center gap-3 rounded-lg bg-editorial-semantic-success/10 px-4 py-3">
            <m.svg
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
              <m.polyline
                points="20 6 9 17 4 12"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </m.svg>
            <span className="text-body font-medium text-editorial-semantic-success">
              {fp("verificationPassed")}
            </span>
          </div>
        )}
      </AnimatedStep>
    </div>
  );
}

function AnimatedStep({ step, children }: { step: Step; children: React.ReactNode }) {
  return (
    <m.div key={step} variants={fadeSlideVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </m.div>
  );
}
