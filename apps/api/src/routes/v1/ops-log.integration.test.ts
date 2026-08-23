import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestContext, type ApiTestContext } from "../../test-utils.js";

describe("Ops Log API 集成测试", () => {
  let ctx: ApiTestContext;

  beforeEach(async () => {
    vi.resetModules();
    ctx = await createApiTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/ops-log 分页与筛选查询", async () => {
    const { logOperation } = await import("../../modules/ops-log/service.js");

    await logOperation({
      action: "create",
      target: "rss_source",
      targetName: "Hacker News",
      detail: "新增源",
    });

    await logOperation({
      action: "delete",
      target: "feeds",
      targetName: "旧文章",
      detail: "清理已读",
      result: "success",
    });

    const res = await ctx.request<{ items: Array<{ action: string }>; total: number }>(
      "/api/v1/ops-log?limit=10&offset=0",
    );
    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);

    const filtered = await ctx.request<{ items: Array<{ action: string }>; total: number }>(
      "/api/v1/ops-log?action=create",
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items.every((i) => i.action === "create")).toBe(true);
  });
});
