import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailyReportScript } from "@feedmind/contracts";
import { logger } from "../../lib/logger.js";
import { createFallbackTimeline, type VideoTimeline } from "./timeline.js";

export interface CaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

// Remotion 4 实测单次长视频渲染远超 30s 默认 timeout；按日报 5-10 分钟上限预留 30 分钟
const RENDER_TIMEOUT_MS = 30 * 60 * 1000;

// 让上层（service.ts）订阅细粒度阶段，把 stitchStage 透到 videos.stage 子阶段
// 命名对齐 Remotion RenderMediaProgress.stitchStage
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

/**
 * 用 Remotion 渲染日报视频：bundle 组合 → 选 composition → renderMedia 产出 mp4。
 * 分段音频 seg-*.mp3 / timeline 由配音步写入 outputDir，作为 bundle publicDir 供 staticFile 引用。
 * 优先系统 Chrome/Edge（无则 Remotion 自动下载 headless shell），字体用系统内置不额外下载；
 * 渲染失败抛错由调用方统一置 failed，不产出占位文件。
 */
export async function renderReportVideo(
  script: DailyReportScript,
  outputDir: string,
  timeline?: VideoTimeline,
  options: RenderOptions = {},
  deps: RenderDeps = {},
): Promise<{ videoPath: string; durationSec: number }> {
  // 动态加载：仅渲染时引入 Remotion 重依赖，避免拖慢服务启动与无关测试
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    import("@remotion/bundler"),
    import("@remotion/renderer"),
  ]);

  const entryPoint = resolve(import.meta.dirname, "../../../remotion/index.ts");
  await mkdir(outputDir, { recursive: true });

  const captions: CaptionCue[] = options.cues ?? [];

  const effectiveTimeline = timeline ?? createFallbackTimeline(script);

  deps.onStage?.("bundling");
  const serveUrl = await bundle({
    entryPoint,
    publicDir: outputDir,
    enableCaching: true,
    onProgress: (p) => logger.debug({ progress: p }, "Remotion bundle 进度"),
  });

  const inputProps = { script, captions, timeline: effectiveTimeline };
  const composition = await selectComposition({ serveUrl, id: "DailyBrief", inputProps });

  // 优先系统浏览器（Chrome→Edge），避免下载 headless shell；系统浏览器用 --headless=new
  const browserExecutable = resolveBrowserExecutable();
  if (browserExecutable) {
    logger.info({ browserExecutable }, "使用系统浏览器渲染日报");
  } else {
    logger.warn("未找到系统 Chrome/Edge，Remotion 将自动下载 headless shell");
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
