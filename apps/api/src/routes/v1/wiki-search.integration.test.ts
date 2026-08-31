import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

// 回归：wiki 搜索从 POST 迁移到 QUERY 方法（RFC 10008，hono 4.13 一等支持）。
// POST 须被 methodNotAllowed 中间件拦为 405 并提示 Allow: QUERY；
// QUERY 走统一 parseJson 管线，不存在的 space 容错为空结果信封。
describe("Wiki 搜索路由 QUERY 方法", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("POST 搜索返回 405 并提示 Allow: QUERY", async () => {
    const res = await ctx.request("/api/v1/wiki/spaces/no-such-space/search", {
      method: "POST",
      body: { query: "测试", topK: 5 },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("QUERY");
    expect(res.body.error).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  });

  it("QUERY 搜索返回空结果信封", async () => {
    const res = await ctx.request("/api/v1/wiki/spaces/no-such-space/search", {
      method: "QUERY",
      body: { query: "不存在的关键词", topK: 5 },
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({ results: [], totalHits: 0 });
  });
});
