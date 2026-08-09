"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Smartphone, ChevronDown } from "lucide-react";
import { Feishu } from "@/components/icons/remote-connection-icons";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MotionSpinner } from "@/components/ui/motion-spinner";
import { cn } from "@/lib/utils";
import { FeishuConfigPanel } from "./feishu-config-panel";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    if (open) {
      void loadConnections();
      setExpandedId(null);
    }
  }, [open, loadConnections]);

  const handleConnect = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
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
        className="w-full max-w-[420px] gap-0 overflow-hidden rounded-lg bg-editorial-surface-card p-0 text-editorial-ink shadow-sm"
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between border-b border-editorial-hairline px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-editorial-surface-strong">
              <Smartphone size={16} className="text-editorial-ink" />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-semibold leading-tight text-editorial-ink">
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
            className="rounded-md hover:bg-editorial-surface-soft"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={16} className="text-editorial-ink-muted" />
          </Button>
        </div>

        {/* 内容区 */}
        <div className="max-h-[420px] overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <MotionSpinner size={20} className="text-editorial-ink-muted" />
            </div>
          ) : (
            <div className="space-y-1">
              {PLATFORMS.map((platform) => {
                const expanded = expandedId === platform.id;
                return (
                  <div key={platform.id}>
                    <PlatformRow
                      platform={platform}
                      connected={!!connections[platform.id]}
                      expanded={expanded}
                      onConnect={handleConnect}
                    />
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3">
                            {platform.id === "feishu" ? (
                              <FeishuConfigPanel onConnected={() => void loadConnections()} />
                            ) : (
                              <p className="px-1 py-2 text-[12px] text-editorial-ink-muted">
                                {t("remoteConnection.comingSoon")}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <div className="border-t border-editorial-hairline px-5 py-3">
          <p className="text-center text-[12px] leading-tight text-editorial-ink-muted">
            {t("remoteConnection.footer")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PlatformRowProps {
  platform: Platform;
  connected: boolean;
  expanded: boolean;
  onConnect: (id: string) => void;
}

function PlatformRow({ platform, connected, expanded, onConnect }: PlatformRowProps) {
  const { t } = useTranslation();
  const { id, nameKey, descriptionKey, icon: Icon } = platform;

  return (
    <motion.button
      type="button"
      onClick={() => onConnect(id)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
        "hover:bg-editorial-surface-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong focus-visible:ring-offset-1 focus-visible:ring-offset-editorial-surface-card",
      )}
    >
      <Icon size={24} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-editorial-ink">{t(nameKey)}</div>
        <div className="mt-0.5 truncate text-[12px] leading-tight text-editorial-ink-muted">
          {t(descriptionKey)}
        </div>
      </div>

      <div className="shrink-0">
        <motion.span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium",
            connected
              ? "bg-editorial-semantic-success/10 text-editorial-semantic-success"
              : "bg-editorial-surface-soft text-editorial-ink-muted",
          )}
          animate={{ opacity: connected ? 1 : 0.75 }}
          transition={{ duration: 0.18 }}
        >
          <motion.span
            className={cn(
              "h-[5px] w-[5px] rounded-full",
              connected ? "bg-editorial-semantic-success" : "bg-editorial-ink-muted",
            )}
            animate={{ scale: connected ? 1 : 0.85 }}
            transition={{ duration: 0.18 }}
          />
          {connected ? t("remoteConnection.connected") : t("remoteConnection.disconnected")}
        </motion.span>
      </div>

      <motion.span
        className="shrink-0 text-editorial-ink-muted"
        animate={{ rotate: expanded ? 180 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronDown size={16} strokeWidth={1.7} />
      </motion.span>
    </motion.button>
  );
}
