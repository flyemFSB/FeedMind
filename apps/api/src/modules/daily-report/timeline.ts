import type { DailyReportScript } from "@feedmind/contracts";

export const FPS = 30;
export const MIN_OPENING_SEC = 2.0; // 开场视觉保底 2 秒
export const MIN_CLOSING_SEC = 3.0; // 收尾视觉保底 3 秒
export const MIN_ITEM_SEC = 6.0; // 场景视觉保底 6 秒
export const SEGMENT_GAP_SEC = 0.3; // 场景间转场呼吸间隙 300ms

export interface TimelineSegment {
  type: "opening" | "item" | "closing";
  index?: number;
  audioFile?: string; // 例如："seg-0.mp3"
  durationSec: number; // 实际音频时长（秒）
  frames: number; // 场景总帧数（含 GAP）
  fromFrame: number; // 时间轴起始帧
}

export interface VideoTimeline {
  fps: number;
  totalFrames: number;
  opening: TimelineSegment;
  items: TimelineSegment[];
  closing: TimelineSegment;
}

// 占位/估算单段时长（兜底用：~300ms/字，最少 1 秒）
export function fallbackDurationSec(text: string): number {
  return Math.max(1.0, Array.from(text).length * 0.3);
}

/**
 * 根据实测的音频时长列表构建精确时间轴（单一事实源）
 * @param durations 长度为 1 (opening) + items.length + 1 (closing) 的秒数数组
 */
export function buildTimeline(durations: number[]): VideoTimeline {
  let cursor = 0;

  // 1. 开场
  const openingSec = durations[0] ?? 0;
  const openingFrames = Math.round(Math.max(openingSec + SEGMENT_GAP_SEC, MIN_OPENING_SEC) * FPS);
  const opening: TimelineSegment = {
    type: "opening",
    audioFile: "seg-0.mp3",
    durationSec: openingSec,
    frames: openingFrames,
    fromFrame: 0,
  };
  cursor += openingFrames;

  // 2. 正文各场景
  const items: TimelineSegment[] = [];
  const itemCount = Math.max(0, durations.length - 2);
  for (let i = 0; i < itemCount; i++) {
    const itemSec = durations[i + 1] ?? 0;
    const frames = Math.round(Math.max(itemSec + SEGMENT_GAP_SEC, MIN_ITEM_SEC) * FPS);
    items.push({
      type: "item",
      index: i,
      audioFile: `seg-${i + 1}.mp3`,
      durationSec: itemSec,
      frames,
      fromFrame: cursor,
    });
    cursor += frames;
  }

  // 3. 收尾
  const closingSec = durations[durations.length - 1] ?? 0;
  const closingFrames = Math.round(Math.max(closingSec + SEGMENT_GAP_SEC, MIN_CLOSING_SEC) * FPS);
  const closing: TimelineSegment = {
    type: "closing",
    audioFile: `seg-${durations.length - 1}.mp3`,
    durationSec: closingSec,
    frames: closingFrames,
    fromFrame: cursor,
  };
  cursor += closingFrames;

  return {
    fps: FPS,
    totalFrames: cursor,
    opening,
    items,
    closing,
  };
}

/**
 * 当未提供实测 timeline 时（例如 Studio 默认预览空脚本），从 script 估算 fallback timeline
 */
export function createFallbackTimeline(script: DailyReportScript): VideoTimeline {
  const durations = [
    fallbackDurationSec(script.opening.hook),
    ...script.items.map((item) => fallbackDurationSec(item.narration)),
    fallbackDurationSec(script.closing.summary),
  ];
  return buildTimeline(durations);
}
