import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Health & Root API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET / 返回服务基本元信息", async () => {
    const res = await ctx.request("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "FeedMind API",
      version: "0.1.0",
    });
  });

  it("GET /api/v1/health 返回健康状态与 DB 连接就绪", async () => {
    const res = await ctx.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({
      status: "ok",
      database: true,
    });
  });

  it("GET 未知路由返回 404 信封", async () => {
    const res = await ctx.request("/api/v1/non-existent-route");
    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toMatchObject({
      code: "HTTP_ERROR",
      message: "请求的资源不存在",
    });
  });
});
