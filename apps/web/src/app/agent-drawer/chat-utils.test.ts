import { describe, expect, it } from "vitest";
import { makeChatTitle, prependOlderPage } from "./chat-utils";
import type { UIMessage } from "@ai-sdk/react";

const msg = (id: string): UIMessage =>
  ({ id, role: "user", parts: [{ type: "text", text: id }] }) as UIMessage;

describe("makeChatTitle", () => {
  it("折叠连续空白并截断到 15 字符", () => {
    expect(makeChatTitle("  你好   世界  ")).toBe("你好 世界");
    expect(makeChatTitle("a".repeat(20))).toBe(`${"a".repeat(15)}…`);
  });

  it("空白文本回退为新会话", () => {
    expect(makeChatTitle("   \n\t ")).toBe("新会话");
    expect(makeChatTitle("")).toBe("新会话");
  });
});

describe("prependOlderPage", () => {
  it("新一页拼接在更早消息之前", () => {
    const older = [msg("p0-1"), msg("p0-2")];
    const page = [msg("p1-1")];
    expect(prependOlderPage(older, page).map((m) => m.id)).toEqual(["p1-1", "p0-1", "p0-2"]);
  });

  it("空页不改变已有消息", () => {
    const older = [msg("a")];
    expect(prependOlderPage(older, [])).toHaveLength(1);
  });
});
