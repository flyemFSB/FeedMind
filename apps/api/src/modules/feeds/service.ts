import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { parseFeed } from "feedsmith";
import { db, feedItem, source, type FeedItemRow } from "@feedmind/db";
import type { Feed } from "@feedmind/contracts";
import { getRouteHandler, CrawlerAuthError } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import { getPlatformCookies, setPlatformCookieValid } from "../cookie-cloud/service.js";
import { platformFromRoute, shouldBackfillTitle } from "../rss-sources/service.js";
import { fetchExternal } from "../../lib/ssrf.js";

/** 数据库行 → API 契约形状（存储层命名与对外契约解耦） */
function toFeedRead(row: FeedItemRow): Feed {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    description: row.summary,
    link: row.url,
    guid: row.guid,
    author: row.author,
    category: row.tags ? JSON.stringify(row.tags) : null,
    image: row.image,
    pubDate: row.publishedAt,
    fetchedAt: row.createdAt,
    isRead: row.readAt !== null,
    createdAt: row.createdAt,
  };
}

export async function listFeeds(params: {
  source_id?: string;
  offset: number;
  limit: number;
}): Promise<{ data: Feed[]; total: number }> {
  const where = params.source_id ? eq(feedItem.sourceId, params.source_id) : undefined;

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(feedItem)
      .where(where),
    db
      .select()
      .from(feedItem)
      .where(where)
      // 排序表达式与 idx_feed_item_timeline 索引列一致
      .orderBy(
        desc(sql`coalesce(${feedItem.publishedAt}, ${feedItem.createdAt})`),
        desc(feedItem.createdAt),
      )
      .limit(params.limit)
      .offset(params.offset),
  ]);

  return {
    data: rows.map(toFeedRead),
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function markRead(feedId: string): Promise<void> {
  const [existing] = await db
    .select({ id: feedItem.id })
    .from(feedItem)
    .where(eq(feedItem.id, feedId))
    .limit(1);
  if (!existing)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "条目不存在",
      {},
      { i18nKey: "apiError.feedItemNotFound" },
    );
  await db
    .update(feedItem)
    .set({ readAt: new Date().toISOString() })
    .where(eq(feedItem.id, feedId));
}

export async function markAllRead(sourceId: string): Promise<void> {
  await db
    .update(feedItem)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(feedItem.sourceId, sourceId), sql`${feedItem.readAt} IS NULL`));
}

export async function deleteFeeds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(feedItem).where(inArray(feedItem.id, ids));
}

// ─── 同步 ─────────────────────────────────────────────────────

interface ParsedRssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string | null;
  author?: string;
  category?: string[];
  image?: string;
}

// RSS 源常见 RFC 2822（如 "Wed, 31 Oct 2018 07:00:00 GMT"）或 ISO 格式。
// 统一转 ISO8601 存储：SQLite 无法解析 RFC 2822，字符串排序会错乱时间序。
function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// 导出供测试直接验证解析/兜底逻辑
export async function parseRssXml(
  xml: string,
): Promise<{ title?: string; items: ParsedRssItem[] }> {
  const result = parseFeed(xml);
  const feed = (result?.feed ?? {}) as Record<string, unknown>;
  const rawItems: unknown[] =
    (Array.isArray(feed["items"]) ? feed["items"] : null) ??
    (Array.isArray(feed["entries"]) ? feed["entries"] : null) ??
    [];

  const items: ParsedRssItem[] = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;

    // GUID 优先级：guid (string/object) -> id -> link (兜底唯一标识)
    let guid = "";
    if (typeof item["guid"] === "string") {
      guid = item["guid"];
    } else if (item["guid"] && typeof item["guid"] === "object") {
      const g = item["guid"] as Record<string, unknown>;
      guid = typeof g["value"] === "string" ? g["value"] : "";
    }
    if (!guid && typeof item["id"] === "string") guid = item["id"];

    const link = typeof item["link"] === "string" ? item["link"] : "";
    if (!guid) guid = link;
    if (!guid) continue;

    const rawTitle =
      typeof item["title"] === "string"
        ? item["title"]
        : item["title"] && typeof item["title"] === "object"
          ? String((item["title"] as Record<string, unknown>)["value"] ?? "")
          : "";

    const description =
      (typeof item["description"] === "string" ? item["description"] : null) ??
      (typeof item["summary"] === "string" ? item["summary"] : null) ??
      "";

    const pubRaw =
      (typeof item["pubDate"] === "string" ? item["pubDate"] : null) ??
      (typeof item["published"] === "string" ? item["published"] : null) ??
      (typeof item["updated"] === "string" ? item["updated"] : null) ??
      (typeof item["date"] === "string" ? item["date"] : null) ??
      "";

    const author =
      (typeof item["author"] === "string" ? item["author"] : null) ??
      (item["author"] && typeof item["author"] === "object"
        ? String((item["author"] as Record<string, unknown>)["name"] ?? "")
        : null) ??
      (typeof item["creator"] === "string" ? item["creator"] : null) ??
      undefined;

    let category: string[] | undefined;
    const rawCategory = item["categories"] ?? item["category"];
    if (Array.isArray(rawCategory)) {
      const list = rawCategory
        .map((c) =>
          typeof c === "string"
            ? c
            : ((c as Record<string, unknown> | undefined)?.["term"] ??
              (c as Record<string, unknown> | undefined)?.["label"]),
        )
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0);
      if (list.length > 0) category = list;
    }
    if (!category && typeof rawCategory === "string" && rawCategory.trim()) {
      category = [rawCategory.trim()];
    }

    const image = extractItemImage(item);
    items.push({
      // title 可能是空串（上游 RSS 常见 bug），?? 兜不住，需显式回退；
      // 回退顺序：link 路径最后一段 slug（如 langchain 空标题条的 slug 即完整标题）→ 占位符
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- 空串也算缺失，必须用 || 而非 ??
      title: rawTitle.trim() || fallbackTitle(link) || "(无标题)",
      description,
      link,
      guid,
      pubDate: normalizeDate(pubRaw),
      ...(author !== undefined ? { author } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(image !== undefined ? { image } : {}),
    });
  }

  const feedTitle = typeof feed["title"] === "string" ? feed["title"] : undefined;
  return { ...(feedTitle !== undefined ? { title: feedTitle } : {}), items };
}

// 从 link 提取 slug 作为标题兜底；无 slug 时返回空串，由调用方继续兜底占位符
function fallbackTitle(link: string): string {
  const seg = link.split("?")[0]?.split("/").filter(Boolean).pop();
  if (!seg) return "";
  return decodeURIComponent(seg)
    .replace(/\.(html?|aspx?|php)$/i, "")
    .replace(/[-_]+/g, " ");
}

// 提取文章缩略图：按优先级兼容多种 RSS 规范（Media RSS 命名空间 → 图片附件 enclosure → iTunes 播客封面 → 通用 image 字段）
function extractItemImage(item: Record<string, unknown>): string | undefined {
  const media = item["media"] as Record<string, unknown> | undefined;
  if (media && typeof media === "object") {
    if (Array.isArray(media["thumbnails"]) && media["thumbnails"][0]) {
      const url = (media["thumbnails"][0] as Record<string, unknown>)["url"];
      if (typeof url === "string" && url) return url;
    }
    if (Array.isArray(media["contents"]) && media["contents"][0]) {
      const url = (media["contents"][0] as Record<string, unknown>)["url"];
      if (typeof url === "string" && url) return url;
    }
    if (Array.isArray(media["groups"]) && media["groups"][0]) {
      const group = media["groups"][0] as Record<string, unknown>;
      if (Array.isArray(group["contents"]) && group["contents"][0]) {
        const url = (group["contents"][0] as Record<string, unknown>)["url"];
        if (typeof url === "string" && url) return url;
      }
    }
    const rawUrl =
      typeof media["url"] === "string"
        ? media["url"]
        : (media["$"] as Record<string, unknown> | undefined)?.["url"];
    if (typeof rawUrl === "string" && rawUrl) return rawUrl;
  }

  const enclosures = Array.isArray(item["enclosures"])
    ? item["enclosures"]
    : item["enclosure"]
      ? [item["enclosure"]]
      : [];
  for (const enc of enclosures) {
    if (enc && typeof enc === "object") {
      const e = enc as Record<string, unknown>;
      const type = typeof e["type"] === "string" ? e["type"] : "";
      const url = typeof e["url"] === "string" ? e["url"] : "";
      if (type.startsWith("image/") && url) return url;
    }
  }

  const itunes = item["itunes"] as Record<string, unknown> | undefined;
  if (itunes && typeof itunes === "object") {
    if (typeof itunes["image"] === "string" && itunes["image"]) return itunes["image"];
    if (itunes["image"] && typeof itunes["image"] === "object") {
      const href = (itunes["image"] as Record<string, unknown>)["href"];
      if (typeof href === "string" && href) return href;
    }
  }

  if (typeof item["image"] === "string" && item["image"]) return item["image"];
  if (item["image"] && typeof item["image"] === "object") {
    const imgUrl = (item["image"] as Record<string, unknown>)["url"];
    if (typeof imgUrl === "string" && imgUrl) return imgUrl;
  }

  return undefined;
}

async function upsertFeeds(sourceId: string, items: ParsedRssItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((item) => ({
    id: randomUUID(),
    sourceId,
    guid: item.guid,
    title: item.title,
    summary: item.description || null,
    url: item.link || null,
    author: item.author ?? null,
    tags: item.category ?? null,
    image: item.image ?? null,
    publishedAt: item.pubDate ?? null,
  }));

  // 批量写入并通过唯一索引（source_id, guid）冲突跳过重复条目
  const inserted = await db.insert(feedItem).values(rows).onConflictDoNothing().returning({
    id: feedItem.id,
  });

  return inserted.length;
}

// 每次同步单源最大拉取条数，仅增量处理最新条目
const MAX_ITEMS_PER_SOURCE = 10;

/** 按发布时间倒序过滤出比已有最新条目更新的内容，并截取指定上限 */
export function pickFreshItems(
  items: ParsedRssItem[],
  threshold: string | null,
  maxItems: number,
): ParsedRssItem[] {
  const sorted = items.toSorted((a, b) => (b.pubDate ?? "").localeCompare(a.pubDate ?? ""));
  if (threshold === null) return sorted.slice(0, maxItems);
  return sorted
    .filter((item) => item.pubDate !== null && item.pubDate > threshold)
    .slice(0, maxItems);
}

async function upsertFeedsLimited(
  sourceId: string,
  items: ParsedRssItem[],
  maxItems: number,
): Promise<number> {
  // 查询当前来源最新发布时间作为增量比对基准
  const [latest] = await db
    .select({ publishedAt: feedItem.publishedAt })
    .from(feedItem)
    .where(and(eq(feedItem.sourceId, sourceId), isNotNull(feedItem.publishedAt)))
    .orderBy(desc(feedItem.publishedAt))
    .limit(1);
  const fresh = pickFreshItems(items, latest?.publishedAt ?? null, maxItems);
  return upsertFeeds(sourceId, fresh);
}

export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  inserted: number;
  errors: string[];
}

export async function syncAll(): Promise<SyncResult> {
  const sources = await db.select().from(source);
  const result: SyncResult = {
    total: sources.length,
    succeeded: 0,
    failed: 0,
    inserted: 0,
    errors: [],
  };

  for (const src of sources) {
    // 回填 channel.title 后合并进末尾的 updatedAt 更新，避免两次写库
    let backfillTitle: string | undefined;
    try {
      if (src.kind === "rss" && src.url) {
        const res = await fetchExternal(src.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const { title: feedTitle, items } = await parseRssXml(xml);
        result.inserted += await upsertFeedsLimited(src.id, items, MAX_ITEMS_PER_SOURCE);
        // 站点自报名称（channel.title，如 "LangChain Blog"）比创建时的域名兜底友好；
        // 仅当 title 仍是域名兜底形态时回填（用户手动改过的名不覆盖）
        if (feedTitle?.trim() && shouldBackfillTitle(src.title, src.url)) {
          backfillTitle = feedTitle.trim();
        }
      } else if (src.kind === "social" && src.route) {
        const platform = src.platform ?? platformFromRoute(src.route);
        if (!platform) throw new Error(`路由 ${src.route} 无法推导平台`);

        const handler = getRouteHandler(src.route);
        if (!handler) throw new Error(`路由 ${src.route} 不存在`);

        const cookies = (await getPlatformCookies(platform)) ?? undefined;

        // 增量去重：该 source 已入库的 guid 列表，传给支持 seen_guids 的路由（weread 等）
        const seenRows = await db
          .select({ guid: feedItem.guid })
          .from(feedItem)
          .where(eq(feedItem.sourceId, src.id));
        const seenGuids = seenRows.map((r) => r.guid).filter((g): g is string => !!g);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        const routeResult = await handler({
          params:
            seenGuids.length > 0 ? { ...src.params, seen_guids: seenGuids } : (src.params ?? {}),
          abortSignal: controller.signal,
          // weread 增量每号最多 10 篇，maxItems 需足够大才能容纳多公众号的新增
          maxItems: src.route === "weread/shelf" ? 500 : 50,
          ...(cookies !== undefined ? { cookies } : {}),
        });
        clearTimeout(timeout);

        const { items } = await parseRssXml(routeResult.rssXml);
        result.inserted += await upsertFeedsLimited(src.id, items, MAX_ITEMS_PER_SOURCE);

        // 拉取成功即 cookie 登录态可用：回写有效状态让 Cookie 面板自愈
        await setPlatformCookieValid(platform, true);
      }

      const now = new Date().toISOString();
      await db
        .update(source)
        .set({
          // 同步成功即刷新行写入时间，UI 以它显示「上次同步」
          updatedAt: now,
          ...(backfillTitle ? { title: backfillTitle } : {}),
        })
        .where(eq(source.id, src.id));

      result.succeeded++;
    } catch (err) {
      // 爬虫显式判定登录态失效才落库 false；网络波动等不定论，避免误报引导用户重登
      if (err instanceof CrawlerAuthError) {
        const platform = src.platform ?? platformFromRoute(src.route ?? "");
        if (platform) await setPlatformCookieValid(platform, false);
      }
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${src.title}: ${message}`);
      logger.warn({ err, sourceId: src.id }, "订阅源同步失败");
    }
  }

  return result;
}
