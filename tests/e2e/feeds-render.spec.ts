import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Client } from "@libsql/client";

/**
 * 信息流页面渲染回归：
 * 虚拟化网格按列数切分行，列数由 ResizeObserver 异步测量得出，首次渲染时仍为 0。
 * 列数为 0 时若直接按 cols 步进切行会退化成死循环，主线程被占满 → 整个页面卡死，
 * 且只要库里存在条目，每次进入信息流都会复现（与是否点过同步无关）。
 * 本用例直连隔离 SQLite 写入条目，断言页面在超时内完成渲染。
 */

const { createClient } = createRequire(import.meta.url)("@libsql/client") as {
  createClient: (config: { url: string }) => Client;
};

const DB_PATH = resolve(import.meta.dirname, "../../temp/test-e2e-data/feedmind.db");
const TITLE = `回归条目-${randomUUID().slice(0, 8)}`;

test.beforeAll(async () => {
  const db = createClient({ url: `file:${DB_PATH}` });
  const sourceId = randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO source (id, kind, url, title, created_at, updated_at) VALUES (?,?,?,?,?,?)",
    args: [
      sourceId,
      "rss",
      `https://regress-${sourceId}.example.com/feed.xml`,
      "回归订阅源",
      now,
      now,
    ],
  });
  await db.execute({
    sql: "INSERT INTO feed_item (id, source_id, title, summary, url, guid, created_at) VALUES (?,?,?,?,?,?,?)",
    args: [
      randomUUID(),
      sourceId,
      TITLE,
      "用于验证信息流虚拟化渲染",
      "https://example.com/a",
      `regress-${sourceId}`,
      now,
    ],
  });
  db.close();
});

test("信息流存在条目时虚拟化网格正常渲染（列数测量前不卡死）", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.message));

  // 卡死时 goto 迟迟拿不到 load 事件，用短超时快速失败而不是拖满默认 30s
  await page.goto("/feeds", { timeout: 15_000 });
  await expect(page.getByText(TITLE)).toBeVisible({ timeout: 10_000 });
  expect(crashes).toEqual([]);
});
