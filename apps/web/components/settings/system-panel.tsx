"use client";

import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SystemPanel() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const currentLang = i18n.language?.startsWith("zh") ? "zh-CN" : "en-US";

  function handleLanguageChange(value: string | null) {
    if (!value) return;
    i18n.changeLanguage(value);
  }

  const themes = [
    { value: "light", label: t("common.light"), icon: Sun },
    { value: "dark", label: t("common.dark"), icon: Moon },
    { value: "system", label: t("common.system"), icon: Monitor },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-editorial-ink">{t("settings.system")}</h3>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">
            {t("settings.systemDescription")}
          </p>
        </div>
      </div>

      {/* Language */}
      <div className="flex items-center justify-between rounded-lg border border-editorial-hairline px-5 py-4">
        <div className="min-w-0">
          <label className="text-[13px] font-medium text-editorial-ink">
            {t("common.language")}
          </label>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">{t("settings.language")}</p>
        </div>
        <Select value={currentLang} onValueChange={handleLanguageChange}>
          <SelectTrigger
            aria-label={t("common.language")}
            className="h-9 w-[150px] rounded-md border-editorial-hairline bg-editorial-surface-card px-3 text-[12px] text-editorial-ink hover:bg-editorial-surface-soft"
          >
            <SelectValue className="text-[12px]">
              {currentLang === "zh-CN" ? t("common.zh-CN") : t("common.en-US")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[150px] rounded-md border-editorial-hairline">
            <SelectItem value="zh-CN" className="text-[12px]">
              {t("common.zh-CN")}
            </SelectItem>
            <SelectItem value="en-US" className="text-[12px]">
              {t("common.en-US")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Theme */}
      <div className="flex items-center justify-between rounded-lg border border-editorial-hairline px-5 py-4">
        <div className="min-w-0">
          <label className="text-[13px] font-medium text-editorial-ink">{t("common.theme")}</label>
          <p className="mt-0.5 text-[12px] text-editorial-ink-muted">{t("settings.theme")}</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-editorial-hairline">
          {themes.map((item) => {
            const Icon = item.icon;
            const isActive = (theme ?? "system") === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setTheme(item.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-editorial-surface-strong text-editorial-ink"
                    : "bg-transparent text-editorial-ink-soft hover:bg-editorial-surface-soft"
                } ${item.value !== themes[themes.length - 1].value ? "border-r border-editorial-hairline" : ""}`}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
