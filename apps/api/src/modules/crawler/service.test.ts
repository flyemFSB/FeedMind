import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 路由处理器全部 mock：crawler 服务只负责任务状态机与 cookie 编排，不真爬。
const { mockGetRouteHandler } = vi.hoisted(() => ({ mockGetRouteHandler: vi.fn() }));
vi.mock("@feedmind/crawler-core", async (importOriginal) => {
  // 保留 CrawlerAuthError 等真实导出，仅替换路由注册表入口
  const orig = (await importOriginal()) as Record<string, unknown>;
  return { ...orig, getRouteHandler: mockGetRouteHandler };
});

async function loadDb() {
  return import("@feedmind/db");
}
type DbModule = Awaited<ReturnType<typeof loadDb>>;

let mod: DbModule;
let dir: string;

// 仅建 crawler 服务用到的两张表，列与 packages/db schema 保持一致
const DDL = [
  `CREATE TABLE crawler_tasks (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    params TEXT NOT NULL,
    cookies TEXT,
    max_items INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    rss_output TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE cookie_store (
    uuid TEXT NOT NULL,
    platform TEXT NOT NULL,
    cookies TEXT NOT NULL,
    valid INTEGER,
    checked_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (current_timestamp),
    PRIMARY KEY (uuid, platform)
  )`,
];

beforeEach(async () => {
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), "feedmind-crawler-"));
  process.env["DATABASE_PATH"] = join(dir, "test.db");
  mod = await loadDb();
  for (const sql of DDL) await mod.client.execute(sql);
  mockGetRouteHandler.mockReset();
});

afterEach(() => {
  mod.closeDb();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录残留无害 */
  }
});

const createInput = { route: "bili/favs", params: {}, max_items: 10 };

describe("createCrawlerTask", () => {
  it("未知路由抛 400 INVALID_ROUTE", async () => {
    mockGetRouteHandler.mockReturnValue(undefined);
    const { createCrawlerTask } = await import("./service.js");
    await expect(createCrawlerTask({ ...createInput, route: "nope/x" })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_ROUTE",
    });
  });

  it("同路由已有 running/queued 任务时抛 409（TOCTOU 并发防护）", async () => {
    mockGetRouteHandler.mockReturnValue(async () => ({
      rssXml: "<rss/>",
      metadata: { itemCount: 0 },
    }));
    const { createCrawlerTask } = await import("./service.js");
    await mod.db.insert(mod.crawlerTasks).values({
      id: "existing",
      route: "bili/favs",
      params: "{}",
      status: "running",
      maxItems: 10,
    });

    await expect(createCrawlerTask(createInput)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("创建成功：queued 入库，cookie 按平台映射自动带出", async () => {
    mockGetRouteHandler.mockReturnValue(async () => ({
      rssXml: "<rss/>",
      metadata: { itemCount: 0 },
    }));
    const { createCrawlerTask } = await import("./service.js");
    await mod.db.insert(mod.cookieStore).values({
      uuid: "u1",
      platform: "bilibili",
      cookies: "SESSDATA=abc",
    });

    const task = await createCrawlerTask(createInput);
    expect(task.status).toBe("queued");
    expect(task.cookies).toBe("SESSDATA=abc");
    expect(task.route).toBe("bili/favs");

    // 等 fire-and-forget 的 runCrawlerTask 结束，避免 afterEach 删库时仍有异步写
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe("cancelTask 状态机", () => {
  it("queued 任务可取消并置 cancelled", async () => {
    const { cancelTask } = await import("./service.js");
    await mod.db.insert(mod.crawlerTasks).values({
      id: "t1",
      route: "bili/favs",
      params: "{}",
      status: "queued",
      maxItems: 10,
    });
    const task = await cancelTask("t1");
    expect(task.status).toBe("cancelled");
  });

  it("已完成任务不可取消，抛 409", async () => {
    const { cancelTask } = await import("./service.js");
    await mod.db.insert(mod.crawlerTasks).values({
      id: "t1",
      route: "bili/favs",
      params: "{}",
      status: "completed",
      maxItems: 10,
    });
    await expect(cancelTask("t1")).rejects.toMatchObject({ status: 409 });
  });

  it("不存在的任务抛 404", async () => {
    const { cancelTask } = await import("./service.js");
    await expect(cancelTask("missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("getTaskRss", () => {
  it("任务存在但无 RSS 输出时抛 404（状态透出便于排查）", async () => {
    const { getTaskRss } = await import("./service.js");
    await mod.db.insert(mod.crawlerTasks).values({
      id: "t1",
      route: "bili/favs",
      params: "{}",
      status: "failed",
      error: "boom",
      maxItems: 10,
    });
    await expect(getTaskRss("t1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("listRouteOptions 降级", () => {
  const feedHandler = async () => ({
    rssXml: `<rss><channel><item><title>收藏夹A</title><description>fav-1</description></item></channel></rss>`,
    metadata: { itemCount: 1 },
  });

  it("登录态失效：抛 401 COOKIE_EXPIRED 且 cookie_store 标记无效", async () => {
    const { CrawlerAuthError } = await import("@feedmind/crawler-core");
    mockGetRouteHandler.mockReturnValue(async () => {
      throw new CrawlerAuthError();
    });
    const { listBiliFavs } = await import("./service.js");
    await mod.db.insert(mod.cookieStore).values({
      uuid: "u1",
      platform: "bilibili",
      cookies: "SESSDATA=expired",
    });

    await expect(listBiliFavs()).rejects.toMatchObject({ status: 401, code: "COOKIE_EXPIRED" });
    const row = await mod.db.select().from(mod.cookieStore).get();
    expect(row?.valid).toBe(false);
  });

  it("普通网络错误降级为空列表而非 500", async () => {
    mockGetRouteHandler.mockReturnValue(async () => {
      throw new Error("网络波动");
    });
    const { listBiliFavs } = await import("./service.js");
    await expect(listBiliFavs()).resolves.toEqual([]);
  });

  it("正常解析 RSS item 为选项列表", async () => {
    mockGetRouteHandler.mockReturnValue(feedHandler);
    const { listBiliFavs } = await import("./service.js");
    await expect(listBiliFavs()).resolves.toEqual([{ name: "收藏夹A", id: "fav-1" }]);
  });

  it("拉取成功回写 valid=true（状态自愈路径）", async () => {
    // 回归：此前只有失败写 false、成功从不写 true，一次瞬时失败留下的"已失效"无法恢复
    mockGetRouteHandler.mockReturnValue(feedHandler);
    const { listBiliFavs } = await import("./service.js");
    await mod.db.insert(mod.cookieStore).values({
      uuid: "u1",
      platform: "bilibili",
      cookies: "SESSDATA=ok",
      valid: false,
      checkedAt: "2026-08-01T00:00:00Z",
    });

    await listBiliFavs();

    const row = await mod.db.select().from(mod.cookieStore).get();
    expect(row?.valid).toBe(true);
    expect(row?.checkedAt).not.toBe("2026-08-01T00:00:00Z");
  });
});
