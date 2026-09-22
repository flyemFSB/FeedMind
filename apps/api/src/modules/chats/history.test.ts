import { describe, expect, it } from "vitest";
import { mergeAssistantTurns } from "./history.js";

const text = (value: string) => ({ type: "text", text: value });
const tool = (toolName: string) => ({ type: `tool-${toolName}`, input: {}, output: "" });

type Message = Parameters<typeof mergeAssistantTurns>[0][number];
const message = (role: "user" | "assistant", parts: unknown[], id: string = role) =>
  ({ id, role, parts }) as unknown as Message;

describe("mergeAssistantTurns", () => {
  it("把同一回合被拆成多条的助手消息合成一条，保持 parts 顺序", () => {
    const merged = mergeAssistantTurns([
      message("user", [text("总结 github trending")], "u1"),
      message("assistant", [text("先抓页面"), tool("web_fetch")], "a1"),
      message("assistant", [text("补一次搜索"), tool("web_search")], "a2"),
      message("assistant", [text("最终回答")], "a3"),
    ]);

    expect(merged.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(merged[1]?.parts.map((p) => (p as { type: string }).type)).toEqual([
      "text",
      "tool-web_fetch",
      "text",
      "tool-web_search",
      "text",
    ]);
  });

  it("用户消息之间不会跨回合合并", () => {
    const merged = mergeAssistantTurns([
      message("user", [text("问题一")], "u1"),
      message("assistant", [text("回答一")], "a1"),
      message("user", [text("问题二")], "u2"),
      message("assistant", [text("回答二")], "a2"),
    ]);

    expect(merged.map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("不修改传入消息的 parts 数组", () => {
    const first = message("assistant", [text("A")], "a1");
    mergeAssistantTurns([first, message("assistant", [text("B")], "a2")]);
    expect(first.parts).toHaveLength(1);
  });
});
