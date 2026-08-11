import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailyReportScript } from "@feedmind/contracts";
import { logger } from "../../lib/logger.js";
import { ToolConfigClient } from "../../mastra/tools/search/config.js";

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
    logger.warn({ err }, "读取 Fish 配置失败，跳过 Fish TTS");
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
      // setMetadata 建立 WebSocket 连接，必须调用一次后才能合成。
      // 注意：开启句/词级边界 metadata 会使微软服务端当前报 Premature close（合成整体失败），
      // 故不请求 metadata；字幕时间轴走按字数估算。
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

// 中文旁白平均语速约 300ms/字，用于按段估算字幕时长。
// 注：msedge-tts 的句/词级边界 metadata 当前被服务端拒绝（Premature close），
// 字幕时间轴暂无法精确到音频，只能估算（见 createEdgeProvider）。
const CHAR_MS = 300;

function estimateDurationMs(text: string): number {
  return Array.from(text).length * CHAR_MS;
}

function formatSrtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const milli = ms % 1000;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

// 每段一条字幕，时长按字数估算
export function buildSrt(segments: NarrationSegment[]): string {
  let cursor = 0;
  const lines: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const start = cursor;
    cursor += estimateDurationMs(segments[i]!.text);
    lines.push(
      `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(cursor)}\n${segments[i]!.text}\n`,
    );
  }
  return lines.join("\n");
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
      logger.warn({ provider: provider.id }, "TTS 返回空音频，尝试下一个");
    } catch (err) {
      logger.warn({ provider: provider.id, err }, "TTS provider 失败，尝试下一个");
    }
  }
  throw new Error("所有 TTS provider 均失败");
}

/**
 * 把脚本旁白合成为 narration.mp3 + narration.srt，写入 outputDir。
 * 全部 provider 失败时写占位音频，不让配音问题中断管线。
 */
export async function synthesizeNarration(
  script: DailyReportScript,
  outputDir: string,
  deps: SynthesizeDeps = {},
): Promise<{ audioPath: string; srtPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const audioPath = resolve(outputDir, "narration.mp3");
  const srtPath = resolve(outputDir, "narration.srt");

  const segments = buildSegments(script);
  if (segments.length === 0) {
    await writeFile(audioPath, Buffer.alloc(0));
    await writeFile(srtPath, "", "utf8");
    return { audioPath, srtPath };
  }

  let providers = deps.providers;
  if (!providers) {
    const key = await (deps.getApiKey ?? getFishApiKey)();
    providers = [];
    if (key) providers.push(createFishProvider(key));
    providers.push(createEdgeProvider());
  }

  try {
    const parts: Buffer[] = [];
    for (const seg of segments) {
      parts.push(await synthesizeWithFallback(seg.text, providers));
    }
    await writeFile(audioPath, Buffer.concat(parts));
    await writeFile(srtPath, buildSrt(segments), "utf8");
  } catch (err) {
    logger.warn({ err }, "配音合成失败，写入占位音频");
    await writeFile(audioPath, Buffer.from("FeedMind 配音占位（TTS 不可用）", "utf8"));
    // 占位音频无时长信息：字幕仍按估算生成，保证渲染有 SRT 可读
    await writeFile(srtPath, buildSrt(segments), "utf8");
  }

  return { audioPath, srtPath };
}
