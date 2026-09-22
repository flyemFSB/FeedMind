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

  // 默认页大小是用户可见契约：不传 limit 时的截断量决定了审计日志是否被误认为「只有这么多」
  it("GET /api/v1/ops-log 未传 limit 时默认返回 50 条", async () => {
    const { logOperation, listOperations } = await import("../../modules/ops-log/service.js");
    for (let i = 0; i < 60; i++) {
      await logOperation({ action: "run", target: "daily_report", targetName: `第 ${i} 条` });
    }

    const res = await ctx.request<{ items: unknown[]; total: number }>("/api/v1/ops-log");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(50);
    expect(res.body.data.total).toBe(60);

    const direct = await listOperations();
    expect(direct.items).toHaveLength(50);
  });
});
