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
  if (!row)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "订阅源不存在",
      {},
      { i18nKey: "apiError.rssSourceNotFound" },
    );
  return row;
}

// 剥离域名开头的 www. 前缀
export function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

// 判断当前标题是否为默认域名形态，仅默认标题允许被 RSS 频道标题自动回填
export function shouldBackfillTitle(title: string, url: string): boolean {
  const host = new URL(url).hostname;
  return title === host || title === stripWww(host);
}

export async function createSource(input: RssSourceCreate): Promise<RssSourceRow> {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const now = new Date().toISOString();
  // RSS 来源默认使用域名兜底标题，社交订阅使用指定标题或平台名称兜底
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
  if (!existing)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "订阅源不存在",
      {},
      { i18nKey: "apiError.rssSourceNotFound" },
    );
  // 级联删除该来源下的全部条目，避免删除来源后遗留孤儿内容；
  // 两次删除置于同一事务，避免半删状态（来源没了条目还在 / 反之亦然）
  await db.transaction(async (tx) => {
    await tx.delete(feeds).where(eq(feeds.sourceId, id));
    await tx.delete(rssSources).where(eq(rssSources.id, id));
  });
}
