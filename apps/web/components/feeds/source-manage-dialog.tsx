"use client";

import { X, Rss, Plus, Trash2, Globe, Bookmark, Heart } from "lucide-react";
import { motion } from "motion/react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Xiaohongshu, Douyin, Bilibili, Zhihu } from "@/components/icons/remote-connection-icons";

interface SourceManageDialogProps {
  open: boolean;
  onClose: () => void;
}

const SOCIAL_PLATFORMS = [
  { id: "xiaohongshu", label: "小红书", icon: Xiaohongshu },
  { id: "douyin", label: "抖音", icon: Douyin },
  { id: "bilibili", label: "B站", icon: Bilibili },
  { id: "zhihu", label: "知乎", icon: Zhihu },
];

export function SourceManageDialog({ open, onClose }: SourceManageDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("rss");
  const [rssUrls, setRssUrls] = useState<string[]>([
    "https://feeds.example.com/tech-news",
    "https://feeds.example.com/ai-latest",
  ]);
  const [newUrl, setNewUrl] = useState("");
  const [connections] = useState<Record<string, boolean>>({
    xiaohongshu: false,
    douyin: false,
    bilibili: true,
    zhihu: false,
  });

  const handleAddRss = useCallback(() => {
    if (!newUrl.trim()) return;
    setRssUrls((prev) => [...prev, newUrl.trim()]);
    setNewUrl("");
  }, [newUrl]);

  const handleRemoveRss = useCallback((url: string) => {
    setRssUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[520px] gap-0 overflow-hidden rounded-2xl bg-editorial-surface-card p-0 text-editorial-ink shadow-lg ring-1 ring-black/5"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-editorial-hairline px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-editorial-ink">
              <Rss size={15} className="text-editorial-ink-on-primary" />
            </div>
            <DialogTitle className="text-[15px] font-semibold leading-tight text-editorial-ink">
              {t("feeds.manageSources")}
            </DialogTitle>
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b border-editorial-hairline px-5">
            <TabsList variant="line" className="w-full justify-start gap-0 bg-transparent h-10">
              <TabsTrigger
                value="rss"
                className="relative px-3 py-2 text-[13px] font-medium text-editorial-ink-muted transition-colors hover:text-editorial-ink data-[state=active]:text-editorial-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-editorial-ink after:opacity-0 data-[state=active]:after:opacity-100 rounded-none"
              >
                RSS
              </TabsTrigger>
              <TabsTrigger
                value="social"
                className="relative px-3 py-2 text-[13px] font-medium text-editorial-ink-muted transition-colors hover:text-editorial-ink data-[state=active]:text-editorial-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-editorial-ink after:opacity-0 data-[state=active]:after:opacity-100 rounded-none"
              >
                {t("feeds.socialSource")}
              </TabsTrigger>
              <TabsTrigger
                value="connection"
                className="relative px-3 py-2 text-[13px] font-medium text-editorial-ink-muted transition-colors hover:text-editorial-ink data-[state=active]:text-editorial-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-editorial-ink after:opacity-0 data-[state=active]:after:opacity-100 rounded-none"
              >
                {t("feeds.connectionConfig")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* RSS 源 */}
          <TabsContent value="rss" className="mt-0 p-5">
            <div className="mb-4 flex gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRss()}
                placeholder={t("feeds.rssUrlPlaceholder")}
                className="flex-1 rounded-lg border border-editorial-hairline-strong bg-editorial-surface-card px-3 py-2 text-[13px] text-editorial-ink outline-none transition-colors focus:border-editorial-ink placeholder:text-editorial-ink-muted"
              />
              <Button
                onClick={handleAddRss}
                disabled={!newUrl.trim()}
                size="sm"
                className="h-9 gap-1.5 shrink-0"
              >
                <Plus size={14} />
                {t("feeds.addFeed")}
              </Button>
            </div>

            {rssUrls.length === 0 ? (
              <div className="py-8 text-center">
                <Globe size={20} className="mx-auto mb-2 text-editorial-ink-muted" />
                <p className="text-[13px] text-editorial-ink-muted">{t("feeds.noRssSources")}</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {rssUrls.map((url) => (
                  <div
                    key={url}
                    className="group flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-editorial-surface-soft"
                  >
                    <Rss size={14} className="shrink-0 text-editorial-ink-muted" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-editorial-ink">
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRss(url)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-editorial-ink-muted opacity-0 transition-all hover:bg-editorial-surface-strong hover:text-editorial-semantic-error group-hover:opacity-100 focus:opacity-100"
                      title={t("feeds.removeFeed")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 社交媒体源 */}
          <TabsContent value="social" className="mt-0 p-5">
            <div className="space-y-4 max-h-[320px] overflow-y-auto">
              {/* 收藏列表 */}
              <div>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Bookmark size={13} className="text-editorial-ink-muted" />
                  <span className="text-[12px] font-medium text-editorial-ink">
                    {t("feeds.socialFavorites")}
                  </span>
                </div>
                <div className="rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 text-center">
                  <Bookmark size={18} className="mx-auto mb-1.5 text-editorial-ink-muted" />
                  <p className="text-[12px] text-editorial-ink-muted">{t("feeds.noFavorites")}</p>
                </div>
              </div>

              {/* 关注博主 */}
              <div>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Heart size={13} className="text-editorial-ink-muted" />
                  <span className="text-[12px] font-medium text-editorial-ink">
                    {t("feeds.socialFollowed")}
                  </span>
                </div>
                <div className="rounded-xl border border-editorial-hairline bg-editorial-surface-card p-4 text-center">
                  <Heart size={18} className="mx-auto mb-1.5 text-editorial-ink-muted" />
                  <p className="text-[12px] text-editorial-ink-muted">{t("feeds.noFollowed")}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 连接配置 / Cookie 管理 */}
          <TabsContent value="connection" className="mt-0 p-5">
            <p className="mb-4 text-[12px] leading-relaxed text-editorial-ink-soft">
              {t("feeds.cookieDesc")}
            </p>
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {SOCIAL_PLATFORMS.map((platform) => {
                const connected = !!connections[platform.id];
                const Icon = platform.icon;
                return (
                  <motion.button
                    key={platform.id}
                    type="button"
                    layout
                    whileTap={{ scale: 0.985 }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                      "hover:bg-editorial-surface-soft",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-hairline-strong",
                    )}
                  >
                    <Icon size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-editorial-ink">
                        {platform.label}
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
                        {connected ? t("feeds.connected") : t("feeds.disconnected")}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* 底部 */}
        <div className="border-t border-editorial-hairline px-5 py-3">
          <p className="text-center text-[11px] leading-tight text-editorial-ink-muted">
            配置后内容将自动出现在资讯管理页面
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
