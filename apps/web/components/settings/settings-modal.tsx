"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Cpu, MessageSquare, Wrench, Package, Monitor } from "lucide-react";
import type { LLMModel } from "@/lib/types";
import { useModels } from "@/lib/hooks/use-models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TabId } from "./settings-types";
import { ModelsPanel } from "./models-panel";
import { ToolsPanel } from "./tools-panel";
import { SkillsPanel } from "./skills-panel";
import { SystemPanel } from "./system-panel";
import { RuntimePanel } from "./runtime-panel";
import { ModelFormDialog } from "./model-form-dialog";
import { EmbeddingModelDialog } from "./embedding-model-dialog";
import { DeleteModelDialog } from "./delete-model-dialog";
import { FREE_MODEL_PRESETS } from "@/lib/constants/free-models";
import { useTranslation } from "react-i18next";
import { fadeSlideVariants } from "@/lib/motion";

interface Tab {
  id: TabId;
  icon: React.ElementType;
  labelKey: string;
}

const TABS: Tab[] = [
  { id: "models", icon: Cpu, labelKey: "settings.models" },
  { id: "runtime", icon: MessageSquare, labelKey: "settings.runtime" },
  { id: "tools", icon: Wrench, labelKey: "settings.tools" },
  { id: "skills", icon: Package, labelKey: "settings.skills" },
  { id: "system", icon: Monitor, labelKey: "settings.system" },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("models");
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModel | null>(null);
  const [deletingModel, setDeletingModel] = useState<LLMModel | null>(null);
  const [showEmbeddingForm, setShowEmbeddingForm] = useState(false);
  const [editingEmbeddingModel, setEditingEmbeddingModel] = useState<LLMModel | null>(null);
  // Fetch data only when dialog is open (avoids unnecessary API calls on page load)
  const { data: chatModels = [] } = useModels("chat", { enabled: open });
  const { data: embeddingModels = [] } = useModels("embedding", { enabled: open });

  function handleModelSaved() {
    setShowModelForm(false);
    setEditingModel(null);
  }

  function handleModelDeleted() {
    setDeletingModel(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-16px)] w-full max-w-[calc(100vw-16px)] grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-xl border-editorial-hairline bg-editorial-surface-card p-0 text-editorial-ink sm:h-[calc(100dvh-32px)] sm:max-w-[calc(100vw-32px)] md:h-[620px] md:max-w-[740px] lg:h-[680px] lg:max-w-[880px]"
      >
        {/* Custom horizontal header bar with DialogTitle for a11y */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-editorial-hairline px-5">
          <div className="flex items-center gap-3">
            <div>
              <DialogTitle className="text-[16px] font-semibold text-editorial-ink">
                {t("settings.title")}
              </DialogTitle>
              <p className="text-[12px] text-editorial-ink-muted">{t("settings.description")}</p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            aria-label={t("common.close")}
            title={t("common.close")}
            className="rounded-lg hover:bg-editorial-surface-soft"
          >
            <X size={18} className="text-editorial-ink-muted" />
          </Button>
        </div>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(v) => {
            if (v) setActiveTab(v as TabId);
          }}
          className="flex min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <aside className="w-[150px] shrink-0 overflow-y-auto border-r border-editorial-hairline bg-editorial-surface-soft p-2.5 max-sm:w-[52px]">
            <TabsList className="w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-medium max-sm:justify-center max-sm:px-0 " +
                    (activeTab === tab.id
                      ? "bg-editorial-accent-soft text-editorial-accent"
                      : "text-editorial-ink-soft hover:bg-editorial-surface-card")
                  }
                >
                  <tab.icon size={16} strokeWidth={1.5} />
                  <span className="max-sm:hidden">{t(tab.labelKey)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                variants={fadeSlideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {activeTab === "models" && (
                  <div className="space-y-6">
                    <ModelsPanel
                      models={chatModels}
                      title={t("settings.chatModels")}
                      onAddModel={() => {
                        setEditingModel(null);
                        setShowModelForm(true);
                      }}
                      onEditModel={(m) => {
                        setEditingModel(m);
                        setShowModelForm(true);
                      }}
                      onDeleteModel={setDeletingModel}
                      freeModelPreset={FREE_MODEL_PRESETS.agnesChat}
                    />
                    <div className="h-px w-full bg-editorial-hairline" />
                    <ModelsPanel
                      models={embeddingModels}
                      title={t("settings.embeddingModels")}
                      showProvider={false}
                      onAddModel={() => {
                        setEditingEmbeddingModel(null);
                        setShowEmbeddingForm(true);
                      }}
                      onEditModel={(m) => {
                        setEditingEmbeddingModel(m);
                        setShowEmbeddingForm(true);
                      }}
                      onDeleteModel={setDeletingModel}
                      freeModelPreset={FREE_MODEL_PRESETS.siliconFlowEmbedding}
                    />
                  </div>
                )}
                {activeTab === "tools" && <ToolsPanel />}
                {activeTab === "skills" && <SkillsPanel />}
                {activeTab === "runtime" && <RuntimePanel />}
                {activeTab === "system" && <SystemPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>

        <ModelFormDialog
          key={editingModel?.id ?? "new-model"}
          open={showModelForm}
          initialModel={editingModel}
          onSubmit={handleModelSaved}
          onOpenChange={(v) => {
            if (!v) {
              setShowModelForm(false);
              setEditingModel(null);
            }
          }}
        />
        <EmbeddingModelDialog
          key={editingEmbeddingModel?.id ?? "new-embedding"}
          open={showEmbeddingForm}
          initialModel={editingEmbeddingModel}
          onSubmit={() => setShowEmbeddingForm(false)}
          onOpenChange={(v) => {
            if (!v) {
              setShowEmbeddingForm(false);
              setEditingEmbeddingModel(null);
            }
          }}
        />
        <DeleteModelDialog
          model={deletingModel}
          onClose={() => setDeletingModel(null)}
          onDeleted={handleModelDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}
