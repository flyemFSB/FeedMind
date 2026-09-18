import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailyReportScript } from "@feedmind/contracts";
import { logger } from "../../lib/logger.js";
import { ToolConfigClient } from "../../mastra/tools/search/config.js";
import { buildTimeline, fallbackDurationSec, type VideoTimeline } from "./timeline.js";

export interface TtsProvider {
  id: string;
  /** 合成单段文本为 mp3 音频 */
  synthesize(text: string): Promise<{ audio: Buffer }>;
}

export interface NarrationSegment {
  text: string;
}

export interface SynthesizeDeps {
  /** provider 列表，顺序即优先级；默认 Fish（若有 key）→ edge-tts */
  providers?: TtsProvider[];
  /** 获取 Fish API key；默认从工具配置读取 */
  getApiKey?: () => Promise<string | undefined>;
}

// ─── Fish（默认） ──────────────────────────────────────────────
// API key 存于 fish_tts 工具的 apiKey 字段（password 类型，读取时自动解密）
export async function getFishApiKey(): Promise<string | undefined> {
  try {
    await ToolConfigClient.getInstance().load();
    const key = ToolConfigClient.getInstance().getTool("fish_tts")?.config?.["apiKey"];
    const trimmed = typeof key === "string" ? key.trim() : "";
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (err) {
    // tools 表缺失或读取失败：Fish 不可用，交给 edge-tts 兜底
    logger.warn({ err }, "读取 Fish 语音配置失败，跳过该渠道");
    return undefined;
  }
}

export function createFishProvider(apiKey: string): TtsProvider {
  return {
    id: "fish",
    synthesize: async (text) => {
      const res = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // 缺省会回落到付费模型，必须显式带免费模型名
          model: "s2.1-pro-free",
        },
        body: JSON.stringify({ text, format: "mp3", sample_rate: 44100, mp3_bitrate: 192 }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Fish TTS 失败: HTTP ${res.status}`);
      return { audio: Buffer.from(await res.arrayBuffer()) };
    },
  };
}

// ─── edge-tts（兜底，免配置） ──────────────────────────────────
export function createEdgeProvider(): TtsProvider {
  return {
    id: "edge-tts",
    synthesize: async (text) => {
      // 动态加载：仅在兜底路径用到时引入该依赖
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const tts = new MsEdgeTTS();
      await tts.setMetadata("zh-CN-XiaoxiaoNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      try {
        const { audioStream } = tts.toStream(text);
        const parts: Buffer[] = [];
        for await (const chunk of audioStream) {
          parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (parts.length === 0) throw new Error("edge-tts 未返回音频");
        return { audio: Buffer.concat(parts) };
      } finally {
        tts.close();
      }
    },
  };
}

// ─── 旁白分段与 SRT ───────────────────────────────────────────

export function buildSegments(script: DailyReportScript): NarrationSegment[] {
  return [
    { text: script.opening.hook },
    ...script.items.map((item) => ({ text: item.narration })),
    { text: script.closing.summary },
  ].filter((s) => s.text.trim().length > 0);
}

/**
 * 探测已写入音频文件的真实时长（秒）。
 * 遇到占位文件或损坏文件时自动回退到字数估算（Fail-Safe）。
 */
export async function probeAudioDurationSec(
  filePath: string,
  fallbackText: string,
): Promise<number> {
  try {
    const { getVideoMetadata } = await import("@remotion/renderer");
    const meta = await getVideoMetadata(filePath);
    if (
      typeof meta.durationInSeconds === "number" &&
      Number.isFinite(meta.durationInSeconds) &&
      meta.durationInSeconds > 0
    ) {
      return meta.durationInSeconds;
    }
  } catch {
    // 占位文件或非标准媒体走兜底
  }
  return fallbackDurationSec(fallbackText);
}

/**
 * 基于实测 Timeline 生成 CaptionCue[] 供 Remotion CaptionBar 烧入画中。
 * 决策：选烧录不产 SRT（避免与 Remotion 字幕职责重复；社媒静音播放也必须看字）
 */
export function buildCuesFromTimeline(
  segments: NarrationSegment[],
  timeline: VideoTimeline,
): { startSec: number; endSec: number; text: string }[] {
  const allTimelineSegments = [timeline.opening, ...timeline.items, timeline.closing];
  const cues: { startSec: number; endSec: number; text: string }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = allTimelineSegments[i];
    const text = segments[i]?.text ?? "";
    if (!seg || !text) continue;
    cues.push({
      startSec: seg.fromFrame / timeline.fps,
      endSec: seg.fromFrame / timeline.fps + seg.durationSec,
      text,
    });
  }
  return cues;
}

// ─── 合成入口 ─────────────────────────────────────────────────

// 单段合成总超时：网络类 provider（edge-tts 无内建超时）可能挂起，必须兜底
const SEGMENT_TIMEOUT_MS = 60_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`TTS 合成超时（${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (err) => {
        clearTimeout(timer);
        rejectPromise(err);
      },
    );
  });
}

async function synthesizeWithFallback(text: string, providers: TtsProvider[]): Promise<Buffer> {
  for (const provider of providers) {
    try {
      const { audio } = await withTimeout(provider.synthesize(text), SEGMENT_TIMEOUT_MS);
      if (audio.length > 0) return audio;
      logger.warn({ provider: provider.id }, "语音合成返回数据为空，尝试备用降级渠道");
    } catch (err) {
      logger.warn({ provider: provider.id, err }, "当前语音合成渠道调用失败，尝试备用降级渠道");
    }
  }
  throw new Error("所有语音合成渠道均失败");
}

/**
 * 把脚本旁白逐段合成并落盘为 seg-0.mp3, seg-1.mp3...，测量真实时长构建 Timeline。
 * 全部 provider 失败时写占位音频并回退估算时长，不让配音问题中断管线。
 * 返回 timeline 与 cues：cues 由 Remotion CaptionBar 烧入画中。
 */
export async function synthesizeNarration(
  script: DailyReportScript,
  outputDir: string,
  deps: SynthesizeDeps = {},
): Promise<{ timeline: VideoTimeline; cues: ReturnType<typeof buildCuesFromTimeline> }> {
  await mkdir(outputDir, { recursive: true });

  const segments = buildSegments(script);
  if (segments.length === 0) {
    const timeline = buildTimeline([0, ...script.items.map(() => 0), 0]);
    return { timeline, cues: [] };
  }

  let providers = deps.providers;
  if (!providers) {
    const key = await (deps.getApiKey ?? getFishApiKey)();
    providers = [];
    if (key) providers.push(createFishProvider(key));
    providers.push(createEdgeProvider());
  }

  const rawTexts = [
    script.opening.hook,
    ...script.items.map((item) => item.narration),
    script.closing.summary,
  ];

  const durations: number[] = [];

  for (let i = 0; i < rawTexts.length; i++) {
    const text = rawTexts[i] ?? "";
    const fileName = `seg-${i}.mp3`;
    const filePath = resolve(outputDir, fileName);

    if (text.trim().length === 0) {
      durations.push(0);
      continue;
    }

    try {
      const audio = await synthesizeWithFallback(text, providers);
      await writeFile(filePath, audio);
      const duration = await probeAudioDurationSec(filePath, text);
      durations.push(duration);
    } catch (err) {
      logger.warn({ err, segIndex: i }, "单段配音合成失败，使用占位静音音频与估算时长兜底");
      await writeFile(filePath, Buffer.from("FeedMind 配音占位（TTS 不可用）", "utf8"));
      durations.push(fallbackDurationSec(text));
    }
  }

  const timeline = buildTimeline(durations);
  const cues = buildCuesFromTimeline(segments, timeline);

  return { timeline, cues };
}
