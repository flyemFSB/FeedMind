import { Cpu } from "lucide-react";
import {
  Claude,
  DeepSeek,
  Gemini,
  Kimi,
  Minimax,
  OpenAI,
  Qwen,
  ZAI,
} from "@/components/icons/provider-icons";

const providerIcons = {
  ChatGPT: OpenAI,
  Gemini,
  Claude,
  Qwen,
  Kimi,
  GLM: ZAI,
  DeepSeek,
  MiniMax: Minimax,
  自定义: Cpu,
} as const;

interface ProviderIconProps {
  provider: string;
  size?: number;
}

const iconClassName =
  "grid shrink-0 place-items-center overflow-hidden leading-none [&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full";

export function ProviderIcon({ provider, size = 24 }: ProviderIconProps) {
  const Icon = providerIcons[provider as keyof typeof providerIcons];

  if (Icon) {
    return (
      <span className={iconClassName} style={{ height: size, width: size }} aria-hidden="true">
        <Icon size={size} />
      </span>
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-editorial-surface-soft text-xs font-semibold leading-none text-editorial-ink"
      style={{ height: size, width: size }}
      aria-hidden="true"
    >
      {provider.charAt(0).toUpperCase()}
    </span>
  );
}
