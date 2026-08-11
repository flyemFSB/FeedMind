import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSrt, resolveBrowserExecutable } from "./render-service.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseSrt", () => {
  it("解析标准 SRT 块", () => {
    const cues = parseSrt(
      "1\n00:00:00,000 --> 00:00:02,100\n早上好\n\n2\n00:00:02,100 --> 00:00:06,300\n我们来看看今天的第一条。\n",
    );
    expect(cues).toEqual([
      { startSec: 0, endSec: 2.1, text: "早上好" },
      { startSec: 2.1, endSec: 6.3, text: "我们来看看今天的第一条。" },
    ]);
  });

  it("忽略无时间轴或无文本的块", () => {
    expect(parseSrt("随便一段文字\n")).toEqual([]);
    expect(parseSrt("1\n00:00:00,000 --> 00:00:01,000\n")).toEqual([]);
  });

  it("兼容 CRLF 换行", () => {
    const cues = parseSrt("1\r\n00:00:00,000 --> 00:00:01,000\r\n字幕A\r\n");
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe("字幕A");
  });
});

describe("resolveBrowserExecutable", () => {
  const existing = (paths: string[]) => (p: string) => paths.includes(p);

  it("env 覆盖优先级最高", () => {
    vi.stubEnv("REMOTION_BROWSER_EXECUTABLE", "C:\\custom\\chrome.exe");
    expect(resolveBrowserExecutable(existing(["C:\\custom\\chrome.exe"]))).toBe(
      "C:\\custom\\chrome.exe",
    );
  });

  it("Chrome 优先于 Edge", () => {
    vi.stubEnv("REMOTION_BROWSER_EXECUTABLE", "");
    vi.stubEnv("CHROME_PATH", "");
    const exists = existing([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
    expect(resolveBrowserExecutable(exists)).toBe(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
  });

  it("无 Chrome 时用 Edge", () => {
    vi.stubEnv("REMOTION_BROWSER_EXECUTABLE", "");
    const exists = existing(["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]);
    expect(resolveBrowserExecutable(exists)).toBe(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  });

  it("都没有时返回 undefined（走自动下载）", () => {
    vi.stubEnv("REMOTION_BROWSER_EXECUTABLE", "");
    expect(resolveBrowserExecutable(() => false)).toBeUndefined();
  });
});
