import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Feeds API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/feeds 分页获取订阅条目", async () => {
    // 准备数据
    await ctx.dbMod.db.insert(ctx.dbMod.rssSources).values({
      id: "src-1",
      type: "rss",
      url: "https://example.com/rss",
      title: "示例订阅源",
    });

    await ctx.dbMod.db.insert(ctx.dbMod.feeds).values([
      {
        id: "feed-1",
        sourceId: "src-1",
        title: "文章一",
        guid: "g-1",
        fetchedAt: "2026-08-01T00:00:00Z",
        isRead: false,
      },
      {
        id: "feed-2",
        sourceId: "src-1",
        title: "文章二",
        guid: "g-2",
        fetchedAt: "2026-08-02T00:00:00Z",
        isRead: false,
      },
    ]);

    const res = await ctx.request<{
      data: unknown[];
      pagination: { total: number; limit: number; offset: number };
    }>("/api/v1/feeds?limit=10&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.data).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({
      total: 2,
      limit: 10,
      offset: 0,
    });
  });

  it("POST /api/v1/feeds/:id/read 标记单条已读", async () => {
    await ctx.dbMod.db.insert(ctx.dbMod.rssSources).values({
      id: "src-1",
      type: "rss",
      url: "https://example.com/rss",
      title: "示例订阅源",
    });

    await ctx.dbMod.db.insert(ctx.dbMod.feeds).values({
      id: "feed-unread",
      sourceId: "src-1",
      title: "待读文章",
      guid: "g-unread",
      fetchedAt: "2026-08-01T00:00:00Z",
      isRead: false,
    });

    const readRes = await ctx.request("/api/v1/feeds/feed-unread/read", {
      method: "POST",
    });
    expect(readRes.status).toBe(200);
    expect(readRes.body.data).toEqual({ action: "done" });
  });

  it("POST /api/v1/feeds/read-all 缺少 source_id 参数返回 400", async () => {
    const res = await ctx.request("/api/v1/feeds/read-all", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("MISSING_PARAM");
  });

  it("DELETE /api/v1/feeds 批量删除条目", async () => {
    await ctx.dbMod.db.insert(ctx.dbMod.rssSources).values({
      id: "src-1",
      type: "rss",
      url: "https://example.com/rss",
      title: "示例订阅源",
    });

    await ctx.dbMod.db.insert(ctx.dbMod.feeds).values([
      {
        id: "feed-del-1",
        sourceId: "src-1",
        title: "文章一",
        guid: "g-1",
        fetchedAt: "2026-08-01T00:00:00Z",
        isRead: false,
      },
    ]);

    const delRes = await ctx.request("/api/v1/feeds", {
      method: "DELETE",
      body: { ids: ["feed-del-1"] },
    });
    expect(delRes.status).toBe(204);

    const listRes = await ctx.request<{ data: unknown[] }>("/api/v1/feeds");
    expect(listRes.body.data.data).toHaveLength(0);
  });
});
