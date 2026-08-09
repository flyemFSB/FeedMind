import { eq } from "drizzle-orm";
import type { RssSourceCreate, RssSourceUpdate } from "@feedmind/contracts";
import { db, rssSources } from "@feedmind/db";
import type { RssSourceRow } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";

export async function listSources(): Promise<RssSourceRow[]> {
  return db.select().from(rssSources).orderBy(rssSources.createdAt);
}

export async function getSource(id: string): Promise<RssSourceRow> {
  const [row] = await db.select().from(rssSources).where(eq(rssSources.id, id)).limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "订阅源不存在");
  return row;
}

export async function createSource(input: RssSourceCreate): Promise<RssSourceRow> {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const now = new Date().toISOString();
  // rss 来源用域名作标题；social 用前端传来的收藏夹/公众号名，缺失时回退平台名
  // （前端传 title 时均为非空，空串场景不会发生，故用 ?? 保留 nullish 语义）
  const title =
    input.type === "rss"
      ? new URL(input.url).hostname
      : (input.title?.trim() ?? input.platform ?? "未命名来源");

  await db.insert(rssSources).values({
    id,
    type: input.type,
    platform: input.platform ?? null,
    route: input.route ?? null,
    url: input.url,
    title,
    params: input.params ? JSON.stringify(input.params) : null,
    createdAt: now,
    updatedAt: now,
  });

  return getSource(id);
}

export async function updateSource(id: string, input: RssSourceUpdate): Promise<RssSourceRow> {
  const row = await getSource(id);
  const newTitle = input.title ?? row.title;
  await db
    .update(rssSources)
    .set({ title: newTitle, updatedAt: new Date().toISOString() })
    .where(eq(rssSources.id, id));
  return getSource(id);
}

export async function deleteSource(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: rssSources.id })
    .from(rssSources)
    .where(eq(rssSources.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "订阅源不存在");
  await db.delete(rssSources).where(eq(rssSources.id, id));
}
