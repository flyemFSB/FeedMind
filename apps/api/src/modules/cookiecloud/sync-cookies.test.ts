import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 回归：CookieCloud 推送是"保活"性质的 cookie 值更新，不代表登录态变化。
// 旧的删表重建会把 valid/checked_at 一并清零——用户刚校验出的"已生效/已失效"
// 在浏览器下次推送后凭空消失，面板状态永远无法稳定收敛
async function loadDb() {
  return import("@feedmind/db");
}
async function loadService() {
  return import("./service.js");
}
type DbModule = Awaited<ReturnType<typeof loadDb>>;
type ServiceModule = Awaited<ReturnType<typeof loadService>>;

let db: DbModule;
let syncCookies: ServiceModule["syncCookies"];
let dir: string;

const DDL = [
  `CREATE TABLE cookie_store (
    uuid TEXT NOT NULL,
    platform TEXT NOT NULL,
    cookies TEXT NOT NULL,
    valid INTEGER,
    checked_at TEXT,
    PRIMARY KEY (uuid, platform)
  )`,
];

beforeEach(async () => {
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), "feedmind-cookiecloud-"));
  process.env["DATABASE_PATH"] = join(dir, "test.db");
  db = await loadDb();
  ({ syncCookies } = await loadService());
  for (const sql of DDL) await db.client.execute(sql);
});

afterEach(() => {
  db.closeDb();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录残留无害 */
  }
});

const PUSH = {
  cookie_data: {
    ".weread.qq.com": [{ name: "wr_skey", value: "fresh" }],
    ".bilibili.com": [{ name: "SESSDATA", value: "fresh" }],
  },
};

const allRows = async () =>
  (await db.client.execute("SELECT * FROM cookie_store ORDER BY platform")).rows;

describe("syncCookies 推送保留校验状态", () => {
  it("覆盖推送同名平台 cookie 时保留既有 valid/checked_at", async () => {
    await db.db.insert(db.cookieStore).values({
      uuid: "ext",
      platform: "weread",
      cookies: "wr_skey=old",
      valid: true,
      checkedAt: "2026-08-01T00:00:00Z",
    });

    await syncCookies("ext", PUSH);

    const rows = await allRows();
    const weread = rows.find((r) => r["platform"] === "weread");
    expect(weread?.["cookies"]).toBe("wr_skey=fresh");
    expect(weread?.["valid"]).toBe(1);
    expect(weread?.["checked_at"]).toBe("2026-08-01T00:00:00Z");
  });

  it("推送中消失的平台行被删除，拼接 cookie 不再带上浏览器已移除的旧值", async () => {
    await db.db.insert(db.cookieStore).values([
      { uuid: "ext", platform: "weread", cookies: "wr_skey=old" },
      { uuid: "ext", platform: "douyin", cookies: "stale=1" },
    ]);

    await syncCookies("ext", PUSH);

    const rows = await allRows();
    expect(rows.map((r) => r["platform"]).sort()).toEqual(["bilibili", "weread"]);
  });

  it("首次推送（无既有行）正常写入且状态为未校验", async () => {
    await syncCookies("ext", PUSH);

    const rows = await allRows();
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r["valid"]).toBeNull();
      expect(r["checked_at"]).toBeNull();
    }
  });

  it("手动来源（manual uuid）的行不受扩展推送影响", async () => {
    await db.db.insert(db.cookieStore).values({
      uuid: "manual",
      platform: "weread",
      cookies: "wr_skey=manual",
      valid: false,
      checkedAt: "2026-08-02T00:00:00Z",
    });

    await syncCookies("ext", PUSH);

    const rows = await allRows();
    const manual = rows.find((r) => r["uuid"] === "manual");
    expect(manual?.["cookies"]).toBe("wr_skey=manual");
  });
});
