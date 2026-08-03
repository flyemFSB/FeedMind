"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "@/components/ui/toast";
import { updateAllToolConfigs } from "@/lib/api/tools";
import { useTools } from "@/lib/hooks/use-tools";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicField } from "./dynamic-field";
import { useTranslation } from "react-i18next";
import { fadeSlideVariants } from "@/lib/motion";

export function ToolsPanel() {
  const { t } = useTranslation();
  const { data: initialTools = [], isLoading } = useTools();
  const [activeTool, setActiveTool] = useState("");
  const [configs, setConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [initialized, setInitialized] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Init local state when data arrives
  useEffect(() => {
    if (initialTools.length > 0 && !initialized) {
      setActiveTool(initialTools[0].name);
      setConfigs(Object.fromEntries(initialTools.map((t) => [t.name, { ...t.config }])));
      setInitialized(true);
    }
  }, [initialTools, initialized]);

  function handleChange(toolName: string, key: string, value: unknown) {
    setTouched((prev) => new Set(prev).add(`${toolName}:${key}`));
    setConfigs((prev) => ({
      ...prev,
      [toolName]: { ...prev[toolName], [key]: value },
    }));
  }

  function handleToolSwitch(toolName: string) {
    // 切换 tool 时清除该 tool 的 touched 记录，避免残留
    setTouched((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (key.startsWith(`${toolName}:`)) next.delete(key);
      }
      return next;
    });
    setActiveTool(toolName);
  }

  async function save() {
    try {
      const payload: Record<string, { config: Record<string, unknown> }> = {};
      for (const tool of initialTools) {
        const current = configs[tool.name] ?? {};
        const changed: Record<string, unknown> = {};
        for (const key of Object.keys(current)) {
          if (touched.has(`${tool.name}:${key}`)) {
            changed[key] = current[key];
          }
        }
        payload[tool.name] = { config: changed };
      }
      await updateAllToolConfigs(payload);
      setTouched(new Set());
      toast.add({ title: t("settings.toolSaved"), type: "success" });
    } catch {
      toast.add({ title: t("settings.saveFailed"), type: "error" });
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!initialTools.length) {
    return (
      <div className="text-[13px] text-editorial-ink-muted px-5 py-4">{t("settings.noTools")}</div>
    );
  }

  const currentTool = initialTools.find((t) => t.name === activeTool) ?? initialTools[0];
  const toolConfig = configs[currentTool.name] ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 px-5">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-editorial-ink">{t("settings.tools")}</h3>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("settings.toolsDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => void save()} className="h-8 rounded-md text-[12px]">
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Tool tabs */}
      <div className="flex gap-1 border-b border-editorial-hairline px-5">
        {initialTools.map((tool) => (
          <button
            key={tool.name}
            onClick={() => handleToolSwitch(tool.name)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 ${
              activeTool === tool.name
                ? "border-editorial-primary text-editorial-ink"
                : "border-transparent text-editorial-ink-muted hover:text-editorial-ink"
            }`}
          >
            {tool.display_name}
          </button>
        ))}
      </div>

      {/* Active tool pane */}
      <div className="px-5 space-y-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentTool.name}
            variants={fadeSlideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {currentTool.description && (
              <p className="text-[12px] text-editorial-ink-muted">{currentTool.description}</p>
            )}
            {(currentTool.config_fields ?? []).length === 0 ? (
              <p className="text-[12px] text-editorial-ink-muted">{t("settings.noConfigFields")}</p>
            ) : (
              currentTool.config_fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-[12px] font-medium text-editorial-ink">
                    {field.label}
                    {field.required && (
                      <span className="ml-0.5 text-editorial-semantic-error">*</span>
                    )}
                  </label>
                  {field.description && (
                    <p className="mb-1.5 text-[12px] text-editorial-ink-muted">
                      {field.description}
                      {field.link && (
                        <>
                          {" "}
                          <a
                            href={field.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-editorial-primary underline underline-offset-2"
                          >
                            {t("settings.getLink")}
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  <DynamicField
                    field={field}
                    value={toolConfig[field.key] ?? field.defaultValue ?? ""}
                    toolName={currentTool.name}
                    passwordSet={currentTool.password_set}
                    onChange={(key, val) => handleChange(currentTool.name, key, val)}
                  />
                </div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
