"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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

interface DynamicFieldProps {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

export function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  if (field.type === "password") {
    return <PasswordField field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "text") {
    const strValue = (value as string) ?? "";
    return (
      <Input
        value={strValue}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="h-9 rounded-xl border-[#d2d2d7] text-[12px]"
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
        className="h-9 w-32 rounded-xl border-[#d2d2d7] text-[12px]"
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
        <SelectTrigger className="h-9 rounded-xl border-[#d2d2d7] text-[12px]">
          <SelectValue placeholder={field.placeholder ?? "选择..."} />
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

function PasswordField({ field, value, onChange }: DynamicFieldProps) {
  const [show, setShow] = useState(false);
  const isSet = value === "__SET__";
  const [editValue, setEditValue] = useState(isSet ? "" : ((value as string) ?? ""));

  return (
    <InputGroup className="h-9 rounded-xl border-[#d2d2d7]">
      <InputGroupInput
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
          onChange(field.key, e.target.value);
        }}
        placeholder={isSet ? "已配置，输入新值以替换" : (field.placeholder ?? "留空则不使用")}
        type={show ? "text" : "password"}
        className="text-[12px]"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => setShow((v) => !v)}
          className="text-[#86868b] hover:text-[#1d1d1f]"
          aria-label={show ? "隐藏密钥" : "显示密钥"}
          title={show ? "隐藏密钥" : "显示密钥"}
        >
          {show ? <EyeOff size={13} strokeWidth={1.7} /> : <Eye size={13} strokeWidth={1.7} />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
