import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyReportScript } from "@feedmind/contracts";
import {
  buildSegments,
  buildSrt,
  createFishProvider,
  synthesizeNarration,
  withTimeout,
  type TtsProvider,
} from "./tts-service.js";

const script: DailyReportScript = {
  date: "2026-08-09",
  opening: { hook: "早上好" },
  items: [
    {
      title: "A",
      points: [],
      quote: null,
      narration: "第一条内容。",
      source: "来源A",
      image: null,
    },
    {
      title: "B",
      points: [],
      quote: null,
      narration: "第二条内容。",
      source: "来源B",
      image: null,
    },
  ],
  closing: { summary: "今天到此为止。" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withTimeout", () => {
  it("超时未完成则拒绝", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow("超时");
  });

  it("正常完成则透传结果", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
});

describe("buildSegments", () => {
  it("按 开场→各条旁白→收尾 提取并过滤空段", () => {
    const segments = buildSegments(script);
    expect(segments.map((s) => s.text)).toEqual([
      "早上好",
      "第一条内容。",
      "第二条内容。",
      "今天到此为止。",
    ]);
    expect(buildSegments({ ...script, opening: { hook: " " } })).toHaveLength(3);
  });
});

describe("buildSrt", () => {
  it("按段生成带序号的 SRT", () => {
    const srt = buildSrt(buildSegments(script));
    expect(srt).toContain("1\n00:00:00,000 --> ");
    expect(srt.split("\n\n").length).toBe(4);
  });
});

describe("createFishProvider", () => {
  it("请求带免费模型头与鉴权，返回 mp3 buffer", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const audio = await createFishProvider("secret-key").synthesize("测试");
    expect(audio.audio).toEqual(Buffer.from([1, 2, 3]));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.fish.audio/v1/tts");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["model"]).toBe("s2.1-pro-free");
    expect(headers["Authorization"]).toBe("Bearer secret-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ text: "测试", format: "mp3" });
  });

  it("非 2xx 抛错（触发上层降级）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 429 })),
    );
    await expect(createFishProvider("k").synthesize("测试")).rejects.toThrow("HTTP 429");
  });
});

describe("synthesizeNarration", () => {
  it("按 provider 顺序合成并写入 mp3 + srt", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "tts-"));
    const provider: TtsProvider = {
      id: "fake",
      synthesize: async (text) => ({ audio: Buffer.from(`audio:${text}`) }),
    };
    const { audioPath, srtPath } = await synthesizeNarration(script, dir, {
      providers: [provider],
    });
    expect(existsSync(audioPath)).toBe(true);
    expect(existsSync(srtPath)).toBe(true);
    expect(readFileSync(srtPath, "utf8")).toContain("第一条内容。");
  });

  it("首个 provider 失败自动降级到下一个", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "tts-"));
    const failing: TtsProvider = {
      id: "fail",
      synthesize: async () => {
        throw new Error("fish 不可用");
      },
    };
    const backup: TtsProvider = {
      id: "backup",
      synthesize: async (text) => ({ audio: Buffer.from(`ok:${text}`) }),
    };
    const { audioPath } = await synthesizeNarration(script, dir, {
      providers: [failing, backup],
    });
    expect(readFileSync(audioPath).toString()).toContain("ok:");
  });

  it("全部 provider 失败时写占位音频而非抛错", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "tts-"));
    const failing: TtsProvider = {
      id: "fail",
      synthesize: async () => {
        throw new Error("down");
      },
    };
    const { audioPath, srtPath } = await synthesizeNarration(script, dir, { providers: [failing] });
    expect(readFileSync(audioPath).toString()).toContain("配音占位");
    // 占位路径仍需产出 SRT（估算时长），保证渲染可读字幕
    expect(readFileSync(srtPath, "utf8")).toContain("早上好");
  });

  it("空旁白写空音频与空字幕", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "tts-"));
    const provider: TtsProvider = {
      id: "fake",
      synthesize: async () => {
        throw new Error("不应被调用");
      },
    };
    const { audioPath, srtPath } = await synthesizeNarration(
      { ...script, opening: { hook: "" }, items: [], closing: { summary: "" } },
      dir,
      { providers: [provider] },
    );
    expect(readFileSync(audioPath)).toHaveLength(0);
    expect(readFileSync(srtPath, "utf8")).toBe("");
  });
});
