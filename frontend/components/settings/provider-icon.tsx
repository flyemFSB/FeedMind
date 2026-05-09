"use client";

import {
  Claude,
  DeepSeek,
  Doubao,
  Gemini,
  Grok,
  Kimi,
  Minimax,
  OpenAI,
  Qwen,
  ZAI,
} from "@lobehub/icons";

const providerIcons = {
  ChatGPT: OpenAI,
  Gemini: Gemini.Color,
  Claude: Claude.Color,
  Grok,
  Qwen: Qwen.Color,
  Doubao: Doubao.Color,
  Kimi,
  GLM: ZAI,
  DeepSeek: DeepSeek.Color,
  MiniMax: Minimax.Color,
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
      <span
        className={iconClassName}
        style={{ height: size, width: size }}
        aria-hidden="true"
      >
        <Icon size={size} />
      </span>
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-[#f5f5f7] text-[10px] font-semibold leading-none text-[#1d1d1f]"
      style={{ height: size, width: size }}
      aria-hidden="true"
    >
      {provider.charAt(0).toUpperCase()}
    </span>
  );
}
