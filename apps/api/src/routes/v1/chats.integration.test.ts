import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

// Mock 会话服务以专注测试路由层的响应装配
const getMessages = vi.hoisted(() => vi.fn());

vi.mock("../../modules/chats/service.js", () => ({
  createChatSession: vi.fn(),
  getChatSession: vi.fn(),
  getChatSessionMessages: getMessages,
  listChatSessions: vi.fn(),
  updateChatSessionTitle: vi.fn(),
  deleteChatSession: vi.fn(),
}));

describe("Chats 路由", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    getMessages.mockReset();
    getMessages.mockResolvedValue([]);
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("会话消息接口按 threadId 返回整段历史", async () => {
    getMessages.mockResolvedValue([
      { id: "m1", role: "user", parts: [{ type: "text", text: "你好" }] },
    ]);
    const res = await ctx.request("/api/v1/chats/sess-1/messages");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(getMessages).toHaveBeenCalledWith("sess-1");
    expect(res.body.data).toMatchObject([{ id: "m1" }]);
  });
});
