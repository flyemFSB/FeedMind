import type { DailyReportScript } from "@feedmind/contracts";

export const FPS = 30;
export const OPENING_FRAMES = FPS * 2; // 2s 开场
export const CLOSING_FRAMES = FPS * 3; // 3s 收尾
const MIN_ITEM_MS = 8000;
// 与 tts-service 的 CHAR_MS 一致，保证场景时长与字幕估算对齐
const CHAR_MS = 300;

export function itemFrames(narration: string): number {
  const ms = Math.max(Array.from(narration).length * CHAR_MS, MIN_ITEM_MS);
  return Math.round((ms / 1000) * FPS);
}

export function totalFrames(script: DailyReportScript): number {
  const items = script.items.reduce((acc, item) => acc + itemFrames(item.narration), 0);
  return OPENING_FRAMES + items + CLOSING_FRAMES;
}
