import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema/index.ts";
import { ensureSchema } from "./ensure-schema.ts";

const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await ensureSchema(client);
});

describe("schema 与 SQLite 兼容", () => {
  it("建出全部业务表", async () => {
    const rows = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = rows.rows.map((r) => String(r["name"]));
    expect(names).toContain("model");
    expect(names).toContain("rss_sources");
    expect(names).toContain("schedule_tasks");
    expect(names).toContain("videos");
    expect(names).toContain("feeds");
    expect(names).toContain("chat_sessions");
    expect(names).toContain("operation_log");
  });

  it("model 插入后应用默认值，自增主键生效", async () => {
    await db.insert(schema.model).values({ provider: "openai", modelName: "gpt-4o" });
    const rows = await db.select().from(schema.model);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(1);
    expect(rows[0]?.type).toBe("chat");
    expect(rows[0]?.modelId).toBe("");
    expect(rows[0]?.isSelected).toBe(false);
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  it("model 唯一约束（type+provider+model_id+base_url）生效", async () => {
    const first = { provider: "anthropic", modelName: "claude", modelId: "same-endpoint" };
    await db.insert(schema.model).values(first);
    await expect(
      db.insert(schema.model).values({ ...first, modelName: "claude-2" }),
    ).rejects.toThrow();
  });

  it("model 部分唯一索引：同 type 仅允许一个 is_selected", async () => {
    await db.insert(schema.model).values([
      { provider: "openai", modelName: "a", modelId: "sel-a", type: "embedding" },
      { provider: "openai", modelName: "b", modelId: "sel-b", type: "embedding" },
    ]);
    await db
      .update(schema.model)
      .set({ isSelected: true })
      .where(eq(schema.model.modelId, "sel-a"));
    await expect(
      db.update(schema.model).set({ isSelected: true }).where(eq(schema.model.modelId, "sel-b")),
    ).rejects.toThrow();
  });

  it("rss_sources 仅填必填列即可，created_at 由默认值填充", async () => {
    await db
      .insert(schema.rssSources)
      .values({ id: "r1", type: "rss", url: "https://x/feed", title: "源" });
    const rows = await db.select().from(schema.rssSources);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("源");
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  it("feeds.is_read 布尔模式往返", async () => {
    await db.insert(schema.rssSources).values({
      id: "src-feed",
      type: "rss",
      url: "https://x/f",
      title: "s",
    });
    await db.insert(schema.feeds).values({
      id: "f1",
      sourceId: "src-feed",
      title: "t",
      guid: "g1",
      fetchedAt: new Date().toISOString(),
      isRead: true,
    });
    const [row] = await db.select().from(schema.feeds);
    expect(row?.isRead).toBe(true);
  });

  it("schedule_tasks 的 boolean 模式往返为 JS 布尔", async () => {
    await db.insert(schema.scheduleTasks).values({
      id: "daily-video",
      name: "日报",
      cron: "0 8 * * *",
      enabled: false,
      createdAt: "2026-08-09",
      updatedAt: "2026-08-09",
    });
    const rows = await db.select().from(schema.scheduleTasks);
    expect(rows[0]?.enabled).toBe(false);
    expect(rows[0]?.timezone).toBe("Asia/Shanghai");
  });
});
