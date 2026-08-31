import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

// 回归：旧实现 Math.max(0, Number(query)) 对垃圾输入放行 NaN，会原样传进 Memory 分页。
// Memory 存储由 createMastra 运行时装配、测试环境不启动，故 mock 服务层专注路由的参数解析行为。
const getMessagesPage = vi.hoisted(() => vi.fn());

vi.mock("../../modules/chats/service.js", () => ({
  createChatSession: vi.fn(),
  getChatSession: vi.fn(),
  getChatSessionMessagesPage: getMessagesPage,
  listChatSessions: vi.fn(),
  updateChatSessionTitle: vi.fn(),
  deleteChatSession: vi.fn(),
}));

describe("Chats 路由分页参数解析", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    getMessagesPage.mockReset();
    getMessagesPage.mockResolvedValue({ messages: [], total: 0, page: 0, hasMore: false });
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("垃圾查询参数回退默认值而非 NaN", async () => {
    const res = await ctx.request("/api/v1/chats/sess-1/messages?page=abc&limit=999");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(getMessagesPage).toHaveBeenCalledWith("sess-1", 0, 30);
  });

  it("合法查询参数正确转型", async () => {
    await ctx.request("/api/v1/chats/sess-1/messages?page=2&limit=50");
    expect(getMessagesPage).toHaveBeenCalledWith("sess-1", 2, 50);
  });
});
