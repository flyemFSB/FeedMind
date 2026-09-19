import { describe, expect, it } from "vitest";
import type { DailyReportScript } from "@feedmind/contracts";
import {
  buildTimeline,
  createFallbackTimeline,
  fallbackDurationSec,
  FPS,
  MIN_OPENING_SEC,
  MIN_CLOSING_SEC,
  MIN_ITEM_SEC,
  SEGMENT_GAP_SEC,
} from "./timeline.js";

describe("Remotion layout timeline", () => {
  it("fallbackDurationSec 按字数估算并具备最小 1 秒保底", () => {
    expect(fallbackDurationSec("")).toBe(1.0);
    expect(fallbackDurationSec("你好")).toBe(1.0);
    expect(fallbackDurationSec("这是一段较长的测试文本内容超过十个字")).toBeCloseTo(5.4, 1);
  });

  it("buildTimeline 正确计算开场、正文各场景和收尾的时间轴与帧数", () => {
    // 各场景预估时长：开场 1.0s、要点0 4.0s、要点1 8.0s、收尾 2.0s
    const durations = [1.0, 4.0, 8.0, 2.0];
    const timeline = buildTimeline(durations);

    expect(timeline.fps).toBe(FPS);

    // opening: 1.0s + 0.3s < MIN_OPENING_SEC(2.0s) -> 2.0s = 60 帧
    expect(timeline.opening.fromFrame).toBe(0);
    expect(timeline.opening.frames).toBe(Math.round(MIN_OPENING_SEC * FPS));
    expect(timeline.opening.audioFile).toBe("seg-0.mp3");

    // item0: 4.0s + 0.3s < MIN_ITEM_SEC(6.0s) -> 6.0s = 180 帧
    expect(timeline.items[0]?.fromFrame).toBe(timeline.opening.frames);
    expect(timeline.items[0]?.frames).toBe(Math.round(MIN_ITEM_SEC * FPS));
    expect(timeline.items[0]?.audioFile).toBe("seg-1.mp3");

    // item1: 8.0s + 0.3s = 8.3s > 6.0s -> 8.3s = 249 帧
    const item1ExpectedFrames = Math.round((8.0 + SEGMENT_GAP_SEC) * FPS);
    expect(timeline.items[1]?.fromFrame).toBe(
      timeline.opening.frames + (timeline.items[0]?.frames ?? 0),
    );
    expect(timeline.items[1]?.frames).toBe(item1ExpectedFrames);
    expect(timeline.items[1]?.audioFile).toBe("seg-2.mp3");

    // closing: 2.0s + 0.3s < MIN_CLOSING_SEC(3.0s) -> 3.0s = 90 帧
    expect(timeline.closing.audioFile).toBe("seg-3.mp3");
    expect(timeline.closing.frames).toBe(Math.round(MIN_CLOSING_SEC * FPS));

    // totalFrames 为全部场景帧数总和
    const expectedTotal =
      timeline.opening.frames +
      timeline.items[0]!.frames +
      timeline.items[1]!.frames +
      timeline.closing.frames;
    expect(timeline.totalFrames).toBe(expectedTotal);
  });

  it("createFallbackTimeline 接收脚本时生成合法时间轴", () => {
    const script: DailyReportScript = {
      date: "2026-08-09",
      opening: { hook: "早上好" },
      items: [
        {
          title: "A",
          points: [],
          quote: null,
          narration: "内容很长很长很长很长很长很长很长很长",
          source: "A",
          image: null,
        },
      ],
      closing: { summary: "结束" },
    };
    const timeline = createFallbackTimeline(script);
    expect(timeline.opening.frames).toBeGreaterThanOrEqual(Math.round(MIN_OPENING_SEC * FPS));
    expect(timeline.items).toHaveLength(1);
    expect(timeline.closing.frames).toBeGreaterThanOrEqual(Math.round(MIN_CLOSING_SEC * FPS));
    expect(timeline.totalFrames).toBeGreaterThan(0);
  });
});
