import { eq } from "drizzle-orm";
import type { RssSourceCreate, RssSourceUpdate } from "@feedmind/contracts";
import { db, feedItem, source } from "@feedmind/db";
import type { SourceRow } from "@feedmind/db";
import { HttpError } from "../../lib/http.js";

export async function listSources(): Promise<SourceRow[]> {
  return db.select().from(source).orderBy(source.createdAt);
}

export async function getSource(id: string): Promise<SourceRow> {
  const [row] = await db.select().from(source).where(eq(source.id, id)).limit(1);
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

/** 路由前缀 → 平台：social 源的平台由路由推导，不采信外部传入 */
const ROUTE_TO_PLATFORM: Record<string, string> = {
  bili: "bilibili",
  dy: "douyin",
  xhs: "xiaohongshu",
  zh: "zhihu",
  weread: "weread",
};

export function platformFromRoute(route: string | undefined): string | null {
  if (!route) return null;
  return ROUTE_TO_PLATFORM[route.split("/")[0] ?? ""] ?? null;
}

export async function createSource(input: RssSourceCreate): Promise<SourceRow> {
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const now = new Date().toISOString();

  if (input.type === "social") {
    const platform = platformFromRoute(input.route);
    if (!input.route || !platform) {
      throw new HttpError(400, "INVALID_ROUTE", `无法从路由推导平台: ${input.route ?? ""}`);
    }
    await db.insert(source).values({
      id,
      kind: "social",
      platform,
      route: input.route,
      url: input.url,
      title: input.title?.trim() || platform,
      params: input.params ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return getSource(id);
  }

  // RSS 来源默认使用域名兜底标题
  const title = stripWww(new URL(input.url).hostname);
  try {
    await db.insert(source).values({
      id,
      kind: "rss",
      url: input.url,
      title,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      throw new HttpError(
        409,
        "CONFLICT",
        "该 RSS 地址已订阅",
        {},
        {
          i18nKey: "apiError.rssSourceExists",
        },
      );
    }
    throw err;
  }

  return getSource(id);
}

export async function updateSource(id: string, input: RssSourceUpdate): Promise<SourceRow> {
  const row = await getSource(id);
  const newTitle = input.title ?? row.title;
  await db
    .update(source)
    .set({ title: newTitle, updatedAt: new Date().toISOString() })
    .where(eq(source.id, id));
  return getSource(id);
}

export async function deleteSource(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: source.id })
    .from(source)
    .where(eq(source.id, id))
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
    await tx.delete(feedItem).where(eq(feedItem.sourceId, id));
    await tx.delete(source).where(eq(source.id, id));
  });
}
