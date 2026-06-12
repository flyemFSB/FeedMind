"use client";

import { useState } from "react";
import { X, Cpu, MessageSquare, Wrench } from "lucide-react";
import type { LLMModel } from "@/lib/types";
import { useLLMModels } from "@/lib/hooks/use-llms";
import { useTools } from "@/lib/hooks/use-tools";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TabId } from "./settings-types";
import { ModelsPanel } from "./models-panel";
import { ToolsPanel } from "./tools-panel";
import { RuntimePanel } from "./runtime-panel";
import { ModelFormDialog } from "./model-form-dialog";
import { DeleteModelDialog } from "./delete-model-dialog";
import { useTranslation } from "react-i18next";

interface Tab {
  id: TabId;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "models", icon: Cpu },
  { id: "runtime", icon: MessageSquare },
  { id: "tools", icon: Wrench },
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
  const { data: tools = [] } = useTools({ enabled: open });

  function handleModelSaved() {
    setShowModelForm(false);
    setEditingModel(null);
  }

  function handleModelDeleted() {
    setDeletingModel(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[1180px] w-[calc(100vw-48px)] h-[min(840px,calc(100vh-48px))] grid-rows-[auto_1fr] gap-0 rounded-2xl bg-white p-0 text-editorial-ink sm:max-w-[1180px]"
      >
        {/* Custom horizontal header bar with DialogTitle for a11y */}
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-editorial-hairline px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-editorial-primary to-editorial-primary flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-editorial-ink">{t("settings.title")}</DialogTitle>
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
          <aside className="w-[220px] shrink-0 overflow-y-auto bg-editorial-surface-soft p-3">
            <TabsList className="w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-left " +
                    (activeTab === tab.id
                      ? "bg-white text-editorial-ink shadow-sm"
                      : "text-editorial-ink-soft hover:bg-white/50")
                  }
                >
                  <tab.icon size={16} strokeWidth={1.5} />
                  <span>{tab.id === "models" ? t("settings.models") : tab.id === "runtime" ? t("settings.runtime") : t("settings.tools")}</span>
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
            {activeTab === "tools" && <ToolsPanel tools={tools} />}
            {activeTab === "runtime" && <RuntimePanel />}
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
