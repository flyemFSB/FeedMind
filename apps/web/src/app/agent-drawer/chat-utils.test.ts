import { describe, expect, it } from "vitest";
import { makeChatTitle } from "./chat-utils";

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
