import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

/**
 * v1 命名空间的运行时表面。
 *
 * 说明：重复路由的检查放在 arch.test.ts 做静态解析——因为 app.routes 的粒度是 handler，
 * 一条带请求体校验的 createRoute 会登记多条同名记录（validator + handler），
 * 用 app.routes 计数会把正常情况误报成重复。
 *
 * 这里验证的是只有真跑起来才知道的两件事：路由可达，以及 /openapi 合并了子路由的 registry。
 */
describe("v1 路由表面", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("/health 可达且返回服务与数据库状态", async () => {
    const res = await ctx.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toMatchObject({ status: "ok", database: true });
  });

  // 只有用 createRoute 声明的端点才进 registry（普通 .get() 不进）。
  // 这里的重点是验证 route() 确实合并了子路由的 registry——改造前 v1Router 是普通 Hono，
  // 其下任何路由都没有 .openapi() 可用，即根本无法被文档化。
  it("/openapi 合并了子路由 registry（跨文件声明的端点都出现）", async () => {
    const res = await ctx.request("/api/v1/openapi");
    expect(res.status).toBe(200);
    const spec = JSON.parse(res.rawText) as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);

    // 三个端点分居两个路由文件：health.ts 与 remote-connection.ts
    expect(paths).toContain("/health");
    expect(paths).toContain("/remote-connections/feishu/register/begin");
    expect(paths).toContain("/remote-connections/feishu/register/poll");
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it("/docs 提供 Scalar 文档 UI", async () => {
    const res = await ctx.request("/api/v1/docs");
    expect(res.status).toBe(200);
    expect(res.rawText).toContain("FeedMind API 文档");
  });
});
