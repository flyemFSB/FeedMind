import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDbContext } from "../../test-utils.js";

let ctx: TestDbContext;
let mod: TestDbContext["dbMod"];

beforeEach(async () => {
  // 每个用例重置模块：db 单例在导入时读取 DATABASE_PATH，需先 resetModules 才能绑定到干净实例
  vi.resetModules();
  // 表结构走生产同源的 ensureSchema，避免手写 DDL 与 schema 漂移
  ctx = await createTestDb({ seedDefaults: false });
  mod = ctx.dbMod;
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("deleteSource 级联删除", () => {
  it("删除来源后其下条目一并删除", async () => {
    await mod.db.insert(mod.rssSources).values({
      id: "s1",
      type: "rss",
      url: "https://example.com/rss",
      title: "源",
    });
    await mod.db.insert(mod.feeds).values([
      { id: "f1", sourceId: "s1", title: "a", guid: "g1", fetchedAt: "2026-01-01" },
      { id: "f2", sourceId: "s1", title: "b", guid: "g2", fetchedAt: "2026-01-01" },
    ]);

    const { deleteSource } = await import("./service.js");
    await deleteSource("s1");

    const sources = await mod.db.select().from(mod.rssSources);
    const items = await mod.db.select().from(mod.feeds);
    expect(sources).toHaveLength(0);
    expect(items).toHaveLength(0);
  });

  it("不影响其他来源的条目", async () => {
    await mod.db.insert(mod.rssSources).values([
      { id: "s1", type: "rss", url: "https://a.example/rss", title: "源A" },
      { id: "s2", type: "rss", url: "https://b.example/rss", title: "源B" },
    ]);
    await mod.db.insert(mod.feeds).values([
      { id: "f1", sourceId: "s1", title: "a", guid: "g1", fetchedAt: "2026-01-01" },
      { id: "f2", sourceId: "s2", title: "b", guid: "g2", fetchedAt: "2026-01-01" },
    ]);

    const { deleteSource } = await import("./service.js");
    await deleteSource("s1");

    const remaining = await mod.db.select().from(mod.feeds);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("f2");
  });

  it("删除不存在的来源抛 404", async () => {
    const { deleteSource } = await import("./service.js");
    await expect(deleteSource("missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteFeeds 批量删除", () => {
  it("按 id 删除指定条目，其余保留", async () => {
    await mod.db.insert(mod.rssSources).values({
      id: "s1",
      type: "rss",
      url: "https://example.com/rss",
      title: "源",
    });
    await mod.db.insert(mod.feeds).values([
      { id: "f1", sourceId: "s1", title: "a", guid: "g1", fetchedAt: "2026-01-01" },
      { id: "f2", sourceId: "s1", title: "b", guid: "g2", fetchedAt: "2026-01-01" },
    ]);

    const { deleteFeeds } = await import("../feeds/service.js");
    await deleteFeeds(["f1"]);

    const remaining = await mod.db.select().from(mod.feeds);
    expect(remaining.map((r) => r.id)).toEqual(["f2"]);
  });

  it("空数组为无操作", async () => {
    const { deleteFeeds } = await import("../feeds/service.js");
    await expect(deleteFeeds([])).resolves.toBeUndefined();
  });
});

describe("DELETE /feeds 路由", () => {
  it("按 ids 删除并返回 204", async () => {
    await mod.db.insert(mod.rssSources).values({
      id: "s1",
      type: "rss",
      url: "https://example.com/rss",
      title: "源",
    });
    await mod.db.insert(mod.feeds).values([
      { id: "f1", sourceId: "s1", title: "a", guid: "g1", fetchedAt: "2026-01-01" },
      { id: "f2", sourceId: "s1", title: "b", guid: "g2", fetchedAt: "2026-01-01" },
    ]);

    const { feedRoutes } = await import("../../routes/v1/feeds.js");
    const res = await feedRoutes.request("/feeds", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["f1"] }),
    });

    expect(res.status).toBe(204);
    const remaining = await mod.db.select().from(mod.feeds);
    expect(remaining.map((r) => r.id)).toEqual(["f2"]);
  });

  it("空 ids 校验失败返回 422", async () => {
    const [{ feedRoutes }, { Hono }, { jsonError }] = await Promise.all([
      import("../../routes/v1/feeds.js"),
      import("hono"),
      import("../../lib/http.js"),
    ]);
    // 子路由单独调用没有全局 onError，挂一个与 app.ts 一致的 HttpError 处理器还原生产行为
    const app = new Hono();
    app.onError((error, c) => {
      if (error instanceof Error && "status" in error && "code" in error) {
        const e = error as { status: number; code: string; message: string };
        return jsonError(c, e.status, e.code, e.message);
      }
      return jsonError(
        c,
        500,
        "INTERNAL_SERVER_ERROR",
        "操作未完成，请重试；若问题持续，请查看应用日志后反馈",
      );
    });
    app.route("/", feedRoutes);

    const res = await app.request("/feeds", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(422);
  });
});
