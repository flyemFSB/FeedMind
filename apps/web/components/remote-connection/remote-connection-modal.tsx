"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { X, Smartphone, Loader2 } from "lucide-react";
import { Feishu } from "@/components/icons/remote-connection-icons";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeishuConnectDialog } from "./feishu-connect-dialog";

interface Platform {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: React.ElementType;
}

const PLATFORMS: Platform[] = [
  {
    id: "feishu",
    nameKey: "remoteConnection.feishu",
    descriptionKey: "remoteConnection.feishuDesc",
    icon: Feishu,
  },
];

interface RemoteConnectionModalProps {
  open: boolean;
  onClose: () => void;
}

export function RemoteConnectionModal({ open, onClose }: RemoteConnectionModalProps) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [showFeishuConnect, setShowFeishuConnect] = useState(false);

  // 从 API 加载连接状态
  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/remote-connections");
      const json = await res.json();
      const map: Record<string, boolean> = {};
      for (const conn of json.data ?? []) {
        map[conn.platform] = conn.status === "connected";
      }
      setConnections(map);
    } catch {
      // 静默失败，使用本地状态
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadConnections();
  }, [open, loadConnections]);

  const handleConnect = (id: string) => {
    if (id === "feishu") {
      setShowFeishuConnect(true);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[420px] gap-0 overflow-hidden rounded-2xl bg-editorial-surface-card p-0 text-editorial-ink shadow-lg ring-1 ring-black/5"
        >
          {/* 弹窗头部 */}
          <div className="flex items-center justify-between border-b border-editorial-hairline px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-editorial-ink">
                <Smartphone size={16} className="text-editorial-ink-on-primary" />
              </div>
              <div>
                <DialogTitle className="text-[15px] font-semibold leading-tight text-editorial-ink">
                  {t("remoteConnection.title")}
                </DialogTitle>
                <p className="mt-0.5 text-[12px] leading-tight text-editorial-ink-muted">
                  {t("remoteConnection.description")}
                </p>
              </div>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="rounded-lg hover:bg-editorial-surface-soft"
            >
              <X size={16} className="text-editorial-ink-muted" />
            </Button>
          </div>

          {/* 内容区 */}
          <div className="max-h-[420px] overflow-y-auto overscroll-contain px-5 py-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-editorial-ink-muted" />
              </div>
            ) : (
              <div className="space-y-1">
                {PLATFORMS.map((platform) => (
                  <div key={platform.id}>
                    <PlatformRow
                      platform={platform}
                      connected={!!connections[platform.id]}
                      onConnect={handleConnect}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部说明 */}
          <div className="border-t border-editorial-hairline px-5 py-3">
            <p className="text-center text-[11px] leading-tight text-editorial-ink-muted">
              {t("remoteConnection.footer")}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <FeishuConnectDialog
        open={showFeishuConnect}
        onClose={() => setShowFeishuConnect(false)}
        onConnected={loadConnections}
      />
    </>
  );
}

interface PlatformRowProps {
  platform: Platform;
  connected: boolean;
  onConnect: (id: string) => void;
}

function PlatformRow({ platform, connected, onConnect }: PlatformRowProps) {
  const { t } = useTranslation();
  const { id, nameKey, descriptionKey, icon: Icon } = platform;

  return (
    <motion.button
      type="button"
      layout
      onClick={() => onConnect(id)}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
        "hover:bg-editorial-surface-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong focus-visible:ring-offset-1 focus-visible:ring-offset-editorial-surface-card",
      )}
    >
      <Icon size={24} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-editorial-ink">{t(nameKey)}</div>
        <div className="mt-0.5 truncate text-[11px] leading-tight text-editorial-ink-muted">
          {t(descriptionKey)}
        </div>
      </div>

      <div className="shrink-0">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-500 ease-out",
            connected
              ? "bg-editorial-semantic-success/10 text-editorial-semantic-success"
              : "bg-editorial-surface-soft text-editorial-ink-muted",
          )}
        >
          <span
            className={cn(
              "h-[5px] w-[5px] rounded-full transition-all duration-500 ease-out",
              connected ? "bg-editorial-semantic-success" : "bg-editorial-ink-muted",
            )}
          />
          {connected ? t("remoteConnection.connected") : t("remoteConnection.disconnected")}
        </span>
      </div>
    </motion.button>
  );
}
