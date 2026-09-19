import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRssXml, pickFreshItems } from "./service.js";
import { stripWww, shouldBackfillTitle } from "../rss-sources/service.js";

// parseRssXml 直接操作 DB 模块的模块级 db 引用？——不，parseRssXml 本身不碰 DB，可独立测
describe("parseRssXml 空标题兜底", () => {
  it("title 为空串时回退到 link slug，而非兜底占位符", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>LangChain Blog</title>
  <item>
    <title></title>
    <link>https://www.langchain.com/blog/building-monday-com-sidekick-why-capable-agents-need-more-than-just-tools</link>
    <guid>https://www.langchain.com/blog/building-monday-com-sidekick</guid>
    <description></description>
    <pubDate>Tue, 11 Aug 2026 22:44:30 GMT</pubDate>
  </item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe(
      "building monday com sidekick why capable agents need more than just tools",
    );
  });

  it("title 与 link slug 都缺失时兜底占位符", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title></title>
    <link></link>
    <guid>g1</guid>
  </item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe("(无标题)");
  });

  it("正常 title 不受影响", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>  Normal Title  </title><link>https://example.com/a</link><guid>g2</guid></item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe("Normal Title");
  });
});

describe("pickFreshItems 按库内最新时间戳增量", () => {
  const items = [
    { guid: "a", pubDate: "2026-08-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "b", pubDate: "2026-07-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "c", pubDate: "2026-06-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "d", pubDate: null, title: "", description: "", link: "" },
  ];

  it("只接受比库内最新 feed 更新的条目", () => {
    const fresh = pickFreshItems(items, "2026-07-15T00:00:00Z", 10);
    expect(fresh.map((i) => i.guid)).toEqual(["a"]);
  });

  // 候选条目均早于或等于阈值时间时返回空数组
  it("无更新条目时返回空数组，不重复抓取已有内容", () => {
    const fresh = pickFreshItems(items, "2026-08-01T00:00:00Z", 10);
    expect(fresh).toEqual([]);
  });

  it("首次同步（无阈值）全量接受前 maxItems 条", () => {
    const fresh = pickFreshItems(items, null, 2);
    expect(fresh.map((i) => i.guid)).toEqual(["a", "b"]);
  });

  it("阈值存在时无 pubDate 条目被拒绝，新条目受上限约束", () => {
    const fresh = pickFreshItems(items, "2026-01-01T00:00:00Z", 1);
    expect(fresh.map((i) => i.guid)).toEqual(["a"]);
  });
});

describe("stripWww / shouldBackfillTitle", () => {
  it("去掉 www 前缀", () => {
    expect(stripWww("www.langchain.com")).toBe("langchain.com");
    expect(stripWww("docs.langchain.com")).toBe("docs.langchain.com");
  });

  it("域名兜底形态可回填，用户自定义标题不可回填", () => {
    expect(shouldBackfillTitle("www.langchain.com", "https://www.langchain.com/blog/rss.xml")).toBe(
      true,
    );
    expect(shouldBackfillTitle("langchain.com", "https://www.langchain.com/blog/rss.xml")).toBe(
      true,
    );
    expect(
      shouldBackfillTitle("docs.langchain.com", "https://docs.langchain.com/oss/rss.xml"),
    ).toBe(true);
    expect(shouldBackfillTitle("我的收藏", "https://www.langchain.com/blog/rss.xml")).toBe(false);
  });
});

// ─── syncAll Cookie 状态回写（需 DB） ────────────────────────────
// 回归：同步成功是登录态可用的最强证据，此前从不回写 valid=true，
// 一次瞬时失败留下的"已失效"标记永远无法恢复，出现"已失效但同步正常"的自相矛盾
const { mockGetRouteHandler } = vi.hoisted(() => ({ mockGetRouteHandler: vi.fn() }));
vi.mock("@feedmind/crawler-core", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return { ...orig, getRouteHandler: mockGetRouteHandler };
});

const MINI_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>书架</title><item>
  <title>文章A</title><link>https://mp.weixin.qq.com/s/abc</link>
  <guid>weread:MP_WXS_1:rev1</guid>
  <pubDate>Tue, 11 Aug 2026 22:44:30 GMT</pubDate>
</item></channel></rss>`;

const SYNC_DDL = [
  `CREATE TABLE rss_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    platform TEXT,
    route TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    params TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE feeds (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    guid TEXT NOT NULL,
    author TEXT,
    category TEXT,
    image TEXT,
    pub_date TEXT,
    fetched_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE UNIQUE INDEX idx_feeds_source_guid ON feeds (source_id, guid)`,
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

describe("syncAll Cookie 状态回写", () => {
  async function loadDb() {
    return import("@feedmind/db");
  }
  type DbModule = Awaited<ReturnType<typeof loadDb>>;
  let db: DbModule;
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    dir = mkdtempSync(join(tmpdir(), "feedmind-feeds-sync-"));
    process.env["DATABASE_PATH"] = join(dir, "test.db");
    db = await loadDb();
    for (const sql of SYNC_DDL) await db.client.execute(sql);
    mockGetRouteHandler.mockReset();
  });

  afterEach(() => {
    db.closeDb();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 临时目录残留无害 */
    }
  });

  it("social 源拉取成功回写 valid=true", async () => {
    mockGetRouteHandler.mockReturnValue(async () => ({
      rssXml: MINI_RSS,
      metadata: { itemCount: 1 },
    }));
    await db.db.insert(db.rssSources).values({
      id: "src-1",
      type: "social",
      platform: "weread",
      route: "weread/shelf",
      url: "https://weread.qq.com",
      title: "书架",
    });
    await db.db.insert(db.cookieStore).values({
      uuid: "ext",
      platform: "weread",
      cookies: "wr_skey=ok",
      valid: false,
      checkedAt: "2026-08-01T00:00:00Z",
    });

    const { syncAll } = await import("./service.js");
    const result = await syncAll();

    expect(result.succeeded).toBe(1);
    const row = await db.db.select().from(db.cookieStore).get();
    expect(row?.valid).toBe(true);
    expect(row?.checkedAt).not.toBe("2026-08-01T00:00:00Z");
  });

  it("爬虫显式判定登录态失效（CrawlerAuthError）落库 valid=false", async () => {
    const { CrawlerAuthError } = await import("@feedmind/crawler-core");
    mockGetRouteHandler.mockReturnValue(async () => {
      throw new CrawlerAuthError("微信读书登录态已失效");
    });
    await db.db.insert(db.rssSources).values({
      id: "src-1",
      type: "social",
      platform: "weread",
      route: "weread/shelf",
      url: "https://weread.qq.com",
      title: "书架",
    });
    await db.db.insert(db.cookieStore).values({
      uuid: "ext",
      platform: "weread",
      cookies: "wr_skey=dead",
      valid: true,
    });

    const { syncAll } = await import("./service.js");
    const result = await syncAll();

    expect(result.failed).toBe(1);
    const row = await db.db.select().from(db.cookieStore).get();
    expect(row?.valid).toBe(false);
  });

  it("普通网络错误不定论，cookie 状态保持原样", async () => {
    mockGetRouteHandler.mockReturnValue(async () => {
      throw new Error("网络波动");
    });
    await db.db.insert(db.rssSources).values({
      id: "src-1",
      type: "social",
      platform: "weread",
      route: "weread/shelf",
      url: "https://weread.qq.com",
      title: "书架",
    });
    await db.db.insert(db.cookieStore).values({
      uuid: "ext",
      platform: "weread",
      cookies: "wr_skey=ok",
      valid: true,
    });

    const { syncAll } = await import("./service.js");
    const result = await syncAll();

    expect(result.failed).toBe(1);
    const row = await db.db.select().from(db.cookieStore).get();
    expect(row?.valid).toBe(true);
  });
});
