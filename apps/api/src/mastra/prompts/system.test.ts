import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPERVISOR_SYSTEM_PROMPT, buildDateSystemMessage, buildSystemPrompt } from "./system.js";

// 缓存前提：前缀必须字节稳定。静态提示词里混入日期 = 每次跨天整段提示词缓存失效，
// 所以这里把"静态段不含易变内容 + 日期段每次现算"钉成回归测试。
describe("系统提示词", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("静态提示词不含日期（否则前缀缓存失效）", () => {
    expect(SUPERVISOR_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SUPERVISOR_SYSTEM_PROMPT).toContain("FeedMind");
  });

  it("日期消息每次读取当前时间，而不是停在进程启动那天", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-01-01T12:00:00Z")); // Asia/Shanghai 20:00
    expect(buildDateSystemMessage()).toEqual({ role: "system", content: "今天是 2026-01-01。" });

    vi.setSystemTime(new Date("2026-02-03T12:00:00Z"));
    expect(buildDateSystemMessage().content).toBe("今天是 2026-02-03。");
  });

  it("subagent 提示词内联日期（一次性 agent，无缓存约束）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    expect(buildSystemPrompt("角色说明")).toBe("角色说明\n\n今天是 2026-01-01。");
  });
});
