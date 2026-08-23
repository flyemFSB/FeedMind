import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Tools API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/tools 获取所有可用工具与初始配置", async () => {
    const res = await ctx.request<Array<{ name: string }>>("/api/v1/tools");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(Array.isArray(res.body.data)).toBe(true);

    const toolNames = res.body.data.map((t) => t.name);
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("web_fetch");
  });

  it("GET /api/v1/tools/runtime 获取脱敏后的运行时配置", async () => {
    const res = await ctx.request("/api/v1/tools/runtime");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("PUT /api/v1/tools 批量更新工具开关与配置", async () => {
    const payload = {
      web_search: {
        is_enabled: true,
        config: {
          tavilyApiKey: "tvly-test-123456",
        },
      },
    };

    const res = await ctx.request("/api/v1/tools", {
      method: "PUT",
      body: payload,
    });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();

    // 重新获取列表验证开关生效
    const toolsRes =
      await ctx.request<Array<{ name: string; is_enabled: boolean }>>("/api/v1/tools");
    const webSearch = toolsRes.body.data.find((t) => t.name === "web_search");
    expect(webSearch?.is_enabled).toBe(true);
  });
});
