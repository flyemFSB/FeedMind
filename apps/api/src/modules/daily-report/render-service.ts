import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailyReportScript } from "@feedmind/contracts";
import type { bundle } from "@remotion/bundler";
import { logger } from "../../lib/logger.js";
import { createFallbackTimeline, type VideoTimeline } from "./timeline.js";

export interface CaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

// 视频渲染单次超时时间（毫秒），预留最长 30 分钟
const RENDER_TIMEOUT_MS = 30 * 60 * 1000;

// 视频渲染细粒度进度阶段枚举
export type RenderStage = "bundling" | "rendering" | "encoding" | "muxing" | "done" | "failed";

export interface RenderDeps {
  /** 渲染阶段回调（bundling / rendering / encoding / muxing / done / failed） */
  onStage?: (stage: RenderStage, progress?: number) => void;
}

export interface RenderOptions {
  /** 由 tts-service 实测 Timeline 生成的烧录字幕 cue；未传则视频无字幕 */
  cues?: CaptionCue[];
}

// 解析 SRT：`HH:MM:SS,mmm --> HH:MM:SS,mmm` + 文本
export function parseSrt(srt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of srt.trim().split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const timeLine = lines[1] ?? "";
    const m = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!m) continue;
    const text = lines.slice(2).join(" ").trim();
    if (!text) continue;
    cues.push({
      startSec: toSeconds(m[1]!, m[2]!, m[3]!, m[4]!),
      endSec: toSeconds(m[5]!, m[6]!, m[7]!, m[8]!),
      text,
    });
  }
  return cues;
}

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

// 优先系统 Chrome，其次 Edge；都不存在返回 undefined（Remotion 自动下载 headless shell）。
// env 覆盖优先级最高，便于桌面端按机型指定。
export function resolveBrowserExecutable(
  exists: (p: string) => boolean = existsSync,
): string | undefined {
  const localAppData = process.env["LOCALAPPDATA"];
  const candidates = [
    process.env["REMOTION_BROWSER_EXECUTABLE"],
    process.env["CHROME_PATH"],
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ...(localAppData ? [`${localAppData}\\Google\\Chrome\\Application\\chrome.exe`] : []),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return candidate;
  }
  return undefined;
}

let _bundlePromise: Promise<string> | null = null;

async function getOrBuildBundle(
  bundleFn: typeof bundle,
  entryPoint: string,
  onProgress?: (p: number) => void,
): Promise<string> {
  if (!_bundlePromise) {
    _bundlePromise = bundleFn(
      entryPoint,
      (p) => {
        onProgress?.(p);
      },
      { enableCaching: true },
    ).catch((err) => {
      _bundlePromise = null;
      throw err;
    });
  }
  return _bundlePromise;
}

/** 使用 Remotion 将日报脚本与音频渲染导出为 MP4 视频 */
export async function renderReportVideo(
  script: DailyReportScript,
  outputDir: string,
  timeline?: VideoTimeline,
  options: RenderOptions = {},
  deps: RenderDeps = {},
): Promise<{ videoPath: string; durationSec: number }> {
  // 仅在视频渲染时动态按需加载 Remotion 打包与渲染引擎
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    import("@remotion/bundler"),
    import("@remotion/renderer"),
  ]);

  const entryPoint = resolve(import.meta.dirname, "../../../remotion/index.ts");
  await mkdir(outputDir, { recursive: true });

  const captions: CaptionCue[] = options.cues ?? [];

  const effectiveTimeline = timeline ?? createFallbackTimeline(script);

  // 全部音频均包含内存 Data URL 时复用单例模板，跳过每次 2~3 秒编译开销与内存峰值；否则降级传递 publicDir
  const hasDataUrls = [
    effectiveTimeline.opening,
    ...effectiveTimeline.items,
    effectiveTimeline.closing,
  ].every((s) => s.audioDataUrl || s.audioFile?.startsWith("data:"));

  deps.onStage?.("bundling");
  const serveUrl = hasDataUrls
    ? await getOrBuildBundle(bundle, entryPoint, (p) =>
        logger.debug({ progress: p }, "Remotion 单例模板打包构建进度"),
      )
    : await bundle({
        entryPoint,
        publicDir: outputDir,
        enableCaching: true,
        onProgress: (p) => logger.debug({ progress: p }, "Remotion 打包构建进度"),
      });

  const inputProps = { script, captions, timeline: effectiveTimeline };
  const composition = await selectComposition({ serveUrl, id: "DailyBrief", inputProps });

  // 优先系统浏览器（Chrome→Edge），避免下载 headless shell；系统浏览器用 --headless=new
  const browserExecutable = resolveBrowserExecutable();
  if (browserExecutable) {
    logger.info({ browserExecutable }, "使用系统内置浏览器渲染日报视频");
  } else {
    logger.warn("未检测到系统 Chrome/Edge 浏览器，Remotion 将自动下载无头浏览器组件");
  }

  const videoPath = resolve(outputDir, "report.mp4");
  deps.onStage?.("rendering");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: videoPath,
    inputProps,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    // 服务端日报渲染是 CPU bound；设 null 让 Remotion 按机器核数自动定（默认 CPU 50%）
    // 显式传值避免 Electron 嵌入场景下默认值把 UI 进程挤死
    concurrency: null,
    ...(browserExecutable ? { browserExecutable, chromeMode: "chrome-for-testing" } : {}),
    onProgress: (p) => {
      // Remotion 的 stitchStage 归并为对外 RenderStage（rendering-frames 等归入 rendering）
      const stage: RenderStage =
        p.stitchStage === "muxing"
          ? "muxing"
          : p.stitchStage === "encoding"
            ? "encoding"
            : "rendering";
      deps.onStage?.(stage, p.progress);
      logger.debug(
        {
          progress: p.progress,
          stage,
          renderedFrames: p.renderedFrames,
          encodedFrames: p.encodedFrames,
        },
        "Remotion 渲染进度",
      );
    },
  });
  deps.onStage?.("done");

  return { videoPath, durationSec: composition.durationInFrames / composition.fps };
}
