"use client";

import { useState } from "react";
import { X, Cpu, MessageSquare, Wrench, Package, Monitor } from "lucide-react";
import type { LLMModel } from "@/lib/types";
import { useLLMModels } from "@/lib/hooks/use-llms";
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
import { DeleteModelDialog } from "./delete-model-dialog";
import { useTranslation } from "react-i18next";

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

  // Fetch data only when dialog is open (avoids unnecessary API calls on page load)
  const { data: models = [] } = useLLMModels({ enabled: open });

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
        className="max-w-[calc(100vw-16px)] w-full h-[calc(100dvh-16px)] sm:max-w-[calc(100vw-32px)] sm:h-[calc(100dvh-32px)] md:max-w-[740px] md:h-[620px] lg:max-w-[880px] lg:h-[680px] grid-rows-[auto_1fr] gap-0 rounded-2xl bg-editorial-surface-card p-0 text-editorial-ink overflow-hidden"
      >
        {/* Custom horizontal header bar with DialogTitle for a11y */}
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-editorial-hairline px-6">
          <div className="flex items-center gap-3">
            <div>
              <DialogTitle className="text-[16px] font-semibold text-editorial-ink">
                {t("settings.title")}
              </DialogTitle>
              <p className="text-[11px] text-editorial-ink-muted">{t("settings.description")}</p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
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
          <aside className="w-[180px] shrink-0 overflow-y-auto bg-editorial-surface-soft p-3">
            <TabsList className="w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-left " +
                    (activeTab === tab.id
                      ? "bg-editorial-surface-card text-editorial-ink shadow-sm"
                      : "text-editorial-ink-soft hover:bg-editorial-surface-card/50")
                  }
                >
                  <tab.icon size={16} strokeWidth={1.5} />
                  <span>{t(tab.labelKey)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {activeTab === "models" && (
              <ModelsPanel
                models={models}
                onAddModel={() => {
                  setEditingModel(null);
                  setShowModelForm(true);
                }}
                onEditModel={(m) => {
                  setEditingModel(m);
                  setShowModelForm(true);
                }}
                onDeleteModel={setDeletingModel}
              />
            )}
            {activeTab === "tools" && <ToolsPanel />}
            {activeTab === "skills" && <SkillsPanel />}
            {activeTab === "runtime" && <RuntimePanel />}
            {activeTab === "system" && <SystemPanel />}
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
        <DeleteModelDialog
          model={deletingModel}
          onClose={() => setDeletingModel(null)}
          onDeleted={handleModelDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}
