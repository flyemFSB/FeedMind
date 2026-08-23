import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("RSS Sources API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("POST /api/v1/rss-sources 创建订阅源并返回 201", async () => {
    const payload = {
      type: "rss",
      url: "https://news.ycombinator.com/rss",
    };

    const res = await ctx.request<{ id: string; type: string; url: string; title: string }>(
      "/api/v1/rss-sources",
      {
        method: "POST",
        body: payload,
      },
    );

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      type: "rss",
      url: "https://news.ycombinator.com/rss",
      title: "news.ycombinator.com",
    });

    const sourceId = res.body.data.id;

    // GET 单个
    const getRes = await ctx.request<{ title: string }>(`/api/v1/rss-sources/${sourceId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe("news.ycombinator.com");

    // DELETE
    const delRes = await ctx.request(`/api/v1/rss-sources/${sourceId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);
  });

  it("POST /api/v1/rss-sources 校验非法 type 抛 422", async () => {
    const res = await ctx.request("/api/v1/rss-sources", {
      method: "POST",
      body: {
        type: "invalid_type",
        url: "https://example.com",
      },
    });

    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
