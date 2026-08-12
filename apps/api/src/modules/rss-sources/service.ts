import { eq } from "drizzle-orm";
import type { RssSourceCreate, RssSourceUpdate } from "@feedmind/contracts";
import { db, rssSources, feeds } from "@feedmind/db";
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

// www.langchain.com → langchain.com：hostname 只是兜底标题，去掉无信息的 www 前缀
export function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

// 当前 title 是否仍是创建时的域名兜底形态（含旧数据可能带 www 前缀）；
// 是则允许用 RSS channel.title 回填（见 feeds/syncAll），用户手动改过的名不覆盖
export function shouldBackfillTitle(title: string, url: string): boolean {
  const host = new URL(url).hostname;
  return title === host || title === stripWww(host);
}

export async function createSource(input: RssSourceCreate): Promise<RssSourceRow> {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const now = new Date().toISOString();
  // rss 来源用域名作标题（首次同步后回填为 RSS 自报站点名，见 feeds/syncAll）；social 用前端传来的收藏夹/公众号名，缺失时回退平台名
  // （前端传 title 时均为非空，空串场景不会发生，故用 ?? 保留 nullish 语义）
  const title =
    input.type === "rss"
      ? stripWww(new URL(input.url).hostname)
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
  // 级联删除该来源下的全部条目，避免删除来源后遗留孤儿内容；
  // 两次删除置于同一事务，避免半删状态（来源没了条目还在 / 反之亦然）
  await db.transaction(async (tx) => {
    await tx.delete(feeds).where(eq(feeds.sourceId, id));
    await tx.delete(rssSources).where(eq(rssSources.id, id));
  });
}
