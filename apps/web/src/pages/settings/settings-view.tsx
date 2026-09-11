import { AnimatePresence, m } from "motion/react";
import { Cpu, MessageSquare, Wrench, Package, Monitor } from "lucide-react";
import { useState } from "react";
import type { LLMModel } from "@/lib/types";
import { useModels } from "@/lib/hooks/use-models";
import type { TabId } from "./settings-types";
import { ModelsPanel } from "./models-panel";
import { ToolsPanel } from "./tools-panel";
import { SkillsPanel } from "./skills-panel";
import { SystemPanel } from "./system-panel";
import { RuntimePanel } from "./runtime-panel";
import { ModelFormDialog } from "./model-form-dialog";
import { EmbeddingModelDialog } from "./embedding-model-dialog";
import { OcrModelDialog } from "./ocr-model-dialog";
import { DeleteModelDialog } from "./delete-model-dialog";
import { FREE_MODEL_PRESETS } from "@/lib/constants/free-models";
import { useTranslation } from "react-i18next";
import { fadeSlideVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TabItem {
  id: TabId;
  icon: React.ElementType;
  labelKey: string;
  descKey: string;
}

const SETTINGS_TABS: TabItem[] = [
  {
    id: "models",
    icon: Cpu,
    labelKey: "settings.models",
    descKey: "settings.modelsDescription",
  },
  {
    id: "runtime",
    icon: MessageSquare,
    labelKey: "settings.runtime",
    descKey: "settings.runtimeDescription",
  },
  {
    id: "tools",
    icon: Wrench,
    labelKey: "settings.tools",
    descKey: "settings.toolsDescription",
  },
  {
    id: "skills",
    icon: Package,
    labelKey: "settings.skills",
    descKey: "settings.skillsDescription",
  },
  {
    id: "system",
    icon: Monitor,
    labelKey: "settings.system",
    descKey: "settings.systemDescription",
  },
];

interface SettingsViewProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * 页面级配置中心主视图：左侧导航导轨 + 右侧宽屏卡片化内容区
 */
export function SettingsView({ activeTab, onTabChange }: SettingsViewProps) {
  const { t } = useTranslation();
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModel | null>(null);
  const [deletingModel, setDeletingModel] = useState<LLMModel | null>(null);
  const [showEmbeddingForm, setShowEmbeddingForm] = useState(false);
  const [editingEmbeddingModel, setEditingEmbeddingModel] = useState<LLMModel | null>(null);
  const [showOcrForm, setShowOcrForm] = useState(false);
  const [editingOcrModel, setEditingOcrModel] = useState<LLMModel | null>(null);

  const { data: chatModels = [] } = useModels("chat");
  const { data: embeddingModels = [] } = useModels("embedding");
  const { data: ocrModels = [] } = useModels("ocr");

  function handleModelSaved() {
    setShowModelForm(false);
    setEditingModel(null);
  }

  function handleModelDeleted() {
    setDeletingModel(null);
  }

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-editorial-surface-card max-md:flex-col">
      {/* 左侧导航导轨 */}
      <aside className="w-60 shrink-0 border-r border-editorial-hairline bg-editorial-surface-soft/40 p-3 max-md:w-full max-md:border-r-0 max-md:border-b max-md:p-2">
        <nav className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "group relative flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent",
                  isActive
                    ? "bg-editorial-surface-strong text-editorial-ink shadow-2xs"
                    : "text-editorial-ink-soft hover:bg-editorial-surface-card hover:text-editorial-ink",
                  "max-md:shrink-0 max-md:items-center max-md:py-2",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "bg-editorial-accent-soft text-editorial-accent"
                      : "text-editorial-ink-muted group-hover:text-editorial-ink",
                    "max-md:mt-0",
                  )}
                >
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.6} />
                </div>
                <div className="min-w-0 flex-1 max-md:flex-none">
                  <div className="text-body font-medium leading-tight">{t(tab.labelKey)}</div>
                  <div className="mt-0.5 truncate text-tiny text-editorial-ink-muted max-md:hidden">
                    {t(tab.descKey, "")}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 右侧主工作区 */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8 max-sm:px-4 max-sm:py-6">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={activeTab}
              variants={fadeSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-8"
            >
              {activeTab === "models" && (
                <div className="space-y-8">
                  {/* 对话模型 */}
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

                  {/* 嵌入模型 */}
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

                  <div className="h-px w-full bg-editorial-hairline" />

                  {/* OCR 模型 */}
                  <ModelsPanel
                    models={ocrModels}
                    title={t("settings.ocrModels")}
                    showProvider={false}
                    onAddModel={() => {
                      setEditingOcrModel(null);
                      setShowOcrForm(true);
                    }}
                    onEditModel={(m) => {
                      setEditingOcrModel(m);
                      setShowOcrForm(true);
                    }}
                    onDeleteModel={setDeletingModel}
                    freeModelPreset={FREE_MODEL_PRESETS.paddleOcr}
                  />
                </div>
              )}

              {activeTab === "runtime" && <RuntimePanel />}
              {activeTab === "tools" && <ToolsPanel />}
              {activeTab === "skills" && <SkillsPanel />}
              {activeTab === "system" && <SystemPanel />}
            </m.div>
          </AnimatePresence>
        </div>
      </main>

      {/* 二级弹窗管理 */}
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
      <OcrModelDialog
        key={editingOcrModel?.id ?? "new-ocr"}
        open={showOcrForm}
        initialModel={editingOcrModel}
        onSubmit={() => setShowOcrForm(false)}
        onOpenChange={(v) => {
          if (!v) {
            setShowOcrForm(false);
            setEditingOcrModel(null);
          }
        }}
      />
      <DeleteModelDialog
        model={deletingModel}
        onClose={() => setDeletingModel(null)}
        onDeleted={handleModelDeleted}
      />
    </div>
  );
}
