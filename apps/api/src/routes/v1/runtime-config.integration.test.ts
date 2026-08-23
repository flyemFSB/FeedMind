import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Runtime Config API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/runtime-configs 获取全部运行时配置", async () => {
    const res =
      await ctx.request<Array<{ runtime: string; temperature: number }>>("/api/v1/runtime-configs");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(Array.isArray(res.body.data)).toBe(true);

    const runtimes = res.body.data.map((c) => c.runtime);
    expect(runtimes).toContain("session");
    expect(runtimes).toContain("wiki");
  });

  it("PUT /api/v1/runtime-configs/session 成功更新温度与提示词", async () => {
    const updatePayload = {
      temperature: 0.7,
      top_p: 0.9,
      system_prompt: "你是一个专业的个人知识库助手。",
    };

    const res = await ctx.request<{
      runtime: string;
      temperature: number;
      top_p: number;
      system_prompt: string;
    }>("/api/v1/runtime-configs/session", {
      method: "PUT",
      body: updatePayload,
    });

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({
      runtime: "session",
      temperature: 0.7,
      top_p: 0.9,
      system_prompt: "你是一个专业的个人知识库助手。",
    });

    // 重新获取验证持久化
    const getRes =
      await ctx.request<Array<{ runtime: string; temperature: number }>>("/api/v1/runtime-configs");
    const sessionConfig = getRes.body.data.find((c) => c.runtime === "session");
    expect(sessionConfig?.temperature).toBe(0.7);
  });

  it("PUT 非法 runtime 返回 422 VALIDATION_ERROR", async () => {
    const res = await ctx.request("/api/v1/runtime-configs/invalid-runtime", {
      method: "PUT",
      body: { temperature: 0.5 },
    });

    expect(res.status).toBe(422);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "运行类型只能是 session 或 wiki",
    });
  });
});
