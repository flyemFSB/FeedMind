import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Skills API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/skills 获取已安装 Skills 列表", async () => {
    const res = await ctx.request<{ items: unknown[] }>("/api/v1/skills");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it("POST /api/v1/skills 非 multipart 格式抛 400", async () => {
    const res = await ctx.request("/api/v1/skills", {
      method: "POST",
      body: { name: "test-skill" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
