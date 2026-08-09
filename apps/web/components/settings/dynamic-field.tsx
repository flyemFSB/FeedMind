"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConfigField } from "@feedmind/contracts";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/toast";
import { getToolRuntime } from "@/lib/api/tools";

interface DynamicFieldProps {
  field: ConfigField;
  value: unknown;
  toolName?: string | undefined;
  passwordSet?: Record<string, boolean> | undefined;
  onChange: (key: string, value: unknown) => void;
}

export function DynamicField({ field, value, toolName, passwordSet, onChange }: DynamicFieldProps) {
  const { t } = useTranslation();
  if (field.type === "password") {
    return (
      <PasswordField
        field={field}
        value={value}
        toolName={toolName}
        passwordSet={passwordSet}
        onChange={onChange}
      />
    );
  }

  if (field.type === "text") {
    const strValue = (value as string) ?? "";
    return (
      <Input
        value={strValue}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="h-9 rounded-md border-editorial-hairline text-[12px]"
      />
    );
  }

  if (field.type === "number") {
    const numValue = (value as number) ?? 0;
    return (
      <Input
        type="number"
        value={numValue}
        onChange={(e) => onChange(field.key, Number(e.target.value))}
        placeholder={field.placeholder}
        className="h-9 w-32 rounded-md border-editorial-hairline text-[12px]"
      />
    );
  }

  if (field.type === "boolean") {
    const boolValue = (value as boolean) ?? false;
    return (
      <Switch checked={boolValue} onCheckedChange={(checked) => onChange(field.key, checked)} />
    );
  }

  if (field.type === "select") {
    const strValue = (value as string) ?? "";
    const options = field.options ?? [];
    return (
      <Select value={strValue} onValueChange={(v) => onChange(field.key, v)}>
        <SelectTrigger className="h-9 rounded-md border-editorial-hairline text-[12px]">
          <SelectValue placeholder={field.placeholder ?? t("settings.selectOption")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-[12px]">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return null;
}

const iconBtnClass =
  "flex h-6 w-6 items-center justify-center rounded-md text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft disabled:opacity-30 disabled:pointer-events-none";

function PasswordField({ field, toolName, passwordSet, onChange }: DynamicFieldProps) {
  const { t } = useTranslation();
  const isSet = passwordSet?.[field.key] ?? false;
  const [visible, setVisible] = useState(false);
  const [realKey, setRealKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  /** 切换可见性时从服务端加载真实密钥 */
  function toggleVisibility() {
    const next = !visible;
    setVisible(next);
    if (next && realKey == null && toolName) {
      getToolRuntime(toolName)
        .then((res) => {
          const val = res.config[field.key];
          setRealKey(typeof val === "string" ? val : "");
        })
        .catch(() => toast.add({ title: t("settings.readKeyFailed"), type: "error" }));
    }
  }

  function copyKey() {
    const keyToCopy = realKey;
    if (keyToCopy) {
      void navigator.clipboard
        .writeText(keyToCopy)
        .then(() => toast.add({ title: t("settings.copied"), type: "success" }));
    }
  }

  // 有密钥时默认显示屏蔽字符，用户开始输入后直接显示输入内容
  const showValue =
    inputValue !== "" ? inputValue : visible && realKey ? realKey : isSet ? "********" : "";

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={showValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(field.key, e.target.value);
        }}
        placeholder={
          isSet
            ? t("settings.passwordReplace")
            : (field.placeholder ?? t("settings.apiKeyPlaceholder"))
        }
        className="h-9 rounded-md border-editorial-hairline text-[12px] pr-14"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={!isSet && inputValue === ""}
          className={iconBtnClass}
          aria-label={visible ? t("settings.hideKey") : t("settings.showKey")}
          title={visible ? t("settings.hideKey") : t("settings.showKey")}
        >
          {visible ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}
        </button>
        <button
          type="button"
          onClick={copyKey}
          disabled={!realKey}
          className={iconBtnClass}
          aria-label={t("settings.copyApiKey")}
          title={t("settings.copyApiKey")}
        >
          <Copy size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
