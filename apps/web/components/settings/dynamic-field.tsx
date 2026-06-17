"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
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
import { toast } from "sonner";
import { getToolRuntime } from "@/lib/api/tools";

interface DynamicFieldProps {
  field: ConfigField;
  value: unknown;
  toolName?: string;
  passwordSet?: Record<string, boolean>;
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
        className="h-9 rounded-xl border-editorial-hairline text-[12px]"
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
        className="h-9 w-32 rounded-xl border-editorial-hairline text-[12px]"
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
        <SelectTrigger className="h-9 rounded-xl border-editorial-hairline text-[12px]">
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
  "flex h-6 w-6 items-center justify-center rounded-md text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft transition-colors disabled:opacity-30 disabled:pointer-events-none";

function PasswordField({ field, toolName, passwordSet, onChange }: DynamicFieldProps) {
  const { t } = useTranslation();
  const isSet = passwordSet?.[field.key] ?? false;
  const [visible, setVisible] = useState(false);
  const [realKey, setRealKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function toggleVisibility() {
    if (!isSet) return;
    const next = !visible;
    setVisible(next);
    if (next && realKey == null && toolName) {
      setLoading(true);
      getToolRuntime(toolName)
        .then((res) => {
          const val = res.config[field.key];
          setRealKey(typeof val === "string" ? val : "");
        })
        .catch(() => toast.error(t("settings.readKeyFailed")))
        .finally(() => setLoading(false));
    }
  }

  function copyKey() {
    if (realKey) {
      navigator.clipboard.writeText(realKey).then(() => toast.success(t("settings.copied")));
    }
  }

  function handleEditSubmit() {
    if (editValue) onChange(field.key, editValue);
    setEditing(false);
    setEditValue("");
    // 提交后刷新状态
    if (editValue) {
      setVisible(false);
      setRealKey(null);
    }
  }

  // 编辑模式：输入新值
  if (editing) {
    return (
      <InputGroup className="h-9 rounded-xl border-editorial-hairline">
        <InputGroupInput
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder={isSet ? t("settings.passwordReplace") : (field.placeholder ?? "sk-...")}
          type="password"
          className="text-[12px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEditSubmit();
            if (e.key === "Escape") {
              setEditing(false);
              setEditValue("");
            }
          }}
          onBlur={handleEditSubmit}
        />
      </InputGroup>
    );
  }

  // 展示模式：跟模型表格一致
  const displayValue = !isSet
    ? t("settings.noApiKey")
    : visible
      ? loading
        ? t("common.loading")
        : (realKey ?? "")
      : "********";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 h-9 rounded-xl border border-editorial-hairline px-3">
      <span
        className={`truncate text-[12px] font-mono ${!isSet ? "text-editorial-ink-muted" : "text-editorial-ink-soft"}`}
        title={visible ? displayValue : t("settings.keyHidden")}
        onDoubleClick={() => {
          setEditing(true);
          setVisible(false);
        }}
      >
        {displayValue}
      </span>
      <div className="flex w-14 justify-end gap-1">
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={!isSet}
          className={iconBtnClass}
          aria-label={visible ? t("settings.hideKey") : t("settings.showKey")}
          title={visible ? t("settings.hideKey") : t("settings.showKey")}
        >
          {visible ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}
        </button>
        <button
          type="button"
          onClick={copyKey}
          disabled={!isSet}
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
