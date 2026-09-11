import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

// 回归：扩展推送会在无配置时隐式创建无密码行（storeEncrypted），
// GET /cookiecloud/config/:uuid 必须对"密码为空"返回 404，否则前端误判"已保存"
describe("CookieCloud 配置查询集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("扩展推送后（无密码配置行）GET config 仍返回 404", async () => {
    // 模拟扩展首次推送：服务端隐式创建 password 为空的配置行
    const push = await ctx.request("/api/v1/cookiecloud/update", {
      method: "POST",
      body: { uuid: "pushed-uuid", encrypted: "ZmFrZS1jaXBoZXJ0ZXh0", crypto_type: "legacy" },
    });
    expect(push.status).toBe(200);

    const res = await ctx.request("/api/v1/cookiecloud/config/pushed-uuid");
    expect(res.status).toBe(404);
  });

  it("前端保存密码后 GET config 返回 200", async () => {
    const save = await ctx.request("/api/v1/cookiecloud/config", {
      method: "POST",
      body: { uuid: "saved-uuid", password: "secret-pw", crypto_type: "legacy" },
    });
    expect(save.status).toBe(200);

    const res = await ctx.request<{ uuid: string; crypto_type: string }>(
      "/api/v1/cookiecloud/config/saved-uuid",
    );
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({ uuid: "saved-uuid", crypto_type: "legacy" });
  });

  it("从无配置行到保存密码：GET 从 404 变为 200", async () => {
    const before = await ctx.request("/api/v1/cookiecloud/config/evolve-uuid");
    expect(before.status).toBe(404);

    await ctx.request("/api/v1/cookiecloud/update", {
      method: "POST",
      body: { uuid: "evolve-uuid", encrypted: "bm90LWd6aXA=" },
    });
    expect((await ctx.request("/api/v1/cookiecloud/config/evolve-uuid")).status).toBe(404);

    await ctx.request("/api/v1/cookiecloud/config", {
      method: "POST",
      body: { uuid: "evolve-uuid", password: "real-pw" },
    });
    expect((await ctx.request("/api/v1/cookiecloud/config/evolve-uuid")).status).toBe(200);
  });
});
