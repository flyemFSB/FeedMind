"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
    return <PasswordField field={field} value={value} toolName={toolName} passwordSet={passwordSet} onChange={onChange} />;
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
      <Switch
        checked={boolValue}
        onCheckedChange={(checked) => onChange(field.key, checked)}
      />
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

function PasswordField({ field, value, toolName, passwordSet, onChange }: DynamicFieldProps) {
  const { t } = useTranslation();
  const isSet = passwordSet?.[field.key] ?? false;
  const [editValue, setEditValue] = useState("");

  return (
    <InputGroup className="h-9 rounded-xl border-editorial-hairline">
      <InputGroupInput
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
          onChange(field.key, e.target.value);
        }}
        placeholder={isSet ? t("settings.passwordReplace") : (field.placeholder ?? t("settings.passwordLeaveEmpty"))}
        type="password"
        className="text-[12px]"
      />
    </InputGroup>
  );
}
