import { randomUUID } from "node:crypto";
import { eq, and, inArray, sql, desc, isNotNull } from "drizzle-orm";
import { parseFeed } from "feedsmith";
import { db, feeds, rssSources, cookieStore } from "@feedmind/db";
import type { FeedRow } from "@feedmind/db";
import { getRouteHandler, CrawlerAuthError } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import { joinCookies } from "../cookie-cloud/service.js";
import { shouldBackfillTitle } from "../rss-sources/service.js";
import { checkSSRF } from "../../lib/ssrf.js";

export async function listFeeds(params: {
  source_id?: string;
  offset: number;
  limit: number;
}): Promise<{ data: FeedRow[]; total: number }> {
  const where = params.source_id ? eq(feeds.sourceId, params.source_id) : undefined;

  const [countResult, data] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(feeds)
      .where(where),
    db
      .select()
      .from(feeds)
      .where(where)
      .orderBy(desc(sql`coalesce(${feeds.pubDate}, ${feeds.fetchedAt})`), desc(feeds.fetchedAt))
      .limit(params.limit)
      .offset(params.offset),
  ]);

  return {
    data,
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function markRead(feedId: string): Promise<void> {
  const [existing] = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.id, feedId))
    .limit(1);
  if (!existing)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "条目不存在",
      {},
      {
        i18nKey: "apiError.feedItemNotFound",
      },
    );
  await db.update(feeds).set({ isRead: true }).where(eq(feeds.id, feedId));
}

export async function markAllRead(sourceId: string): Promise<void> {
  await db.update(feeds).set({ isRead: true }).where(eq(feeds.sourceId, sourceId));
}

export async function deleteFeeds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(feeds).where(inArray(feeds.id, ids));
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
      guid = String((item["guid"] as Record<string, unknown>)["value"] ?? "");
    }
    if (!guid && typeof item["id"] === "string") {
      guid = item["id"];
    }

    let link = "";
    if (typeof item["link"] === "string") {
      link = item["link"];
    } else if (item["link"] && typeof item["link"] === "object") {
      link = String((item["link"] as Record<string, unknown>)["href"] ?? "");
    } else if (Array.isArray(item["links"]) && item["links"][0]) {
      const firstLink = item["links"][0];
      link = typeof firstLink === "string" ? firstLink : String(firstLink?.href ?? "");
    }

    guid = guid || link;
    if (!guid) continue;

    const image = extractItemImage(item);

    const rawTitle =
      typeof item["title"] === "string"
        ? item["title"]
        : item["title"] && typeof item["title"] === "object"
          ? String((item["title"] as Record<string, unknown>)["value"] ?? "")
          : "";

    const description = String(
      item["content"] ??
        item["contentSnippet"] ??
        item["summary"] ??
        item["description"] ??
        item["content:encoded"] ??
        "",
    );

    const rawDate = String(
      item["isoDate"] ??
        item["pubDate"] ??
        item["published"] ??
        item["updated"] ??
        (item["dc"] as Record<string, unknown> | undefined)?.["date"] ??
        "",
    );

    const author =
      typeof item["author"] === "string"
        ? item["author"]
        : ((item["author"] as Record<string, unknown> | undefined)?.["name"] ??
          (item["dc"] as Record<string, unknown> | undefined)?.["creator"] ??
          (Array.isArray(item["authors"])
            ? ((item["authors"][0] as Record<string, unknown> | undefined)?.["name"] ??
              item["authors"][0])
            : undefined));

    let category: string[] | undefined;
    if (Array.isArray(item["categories"])) {
      category = item["categories"]
        .map((c) =>
          typeof c === "string"
            ? c
            : ((c as Record<string, unknown> | undefined)?.["name"] ??
              (c as Record<string, unknown> | undefined)?.["term"] ??
              (c as Record<string, unknown> | undefined)?.["label"]),
        )
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0);
      if (category.length === 0) category = undefined;
    }

    items.push({
      // title 可能是空串（上游 RSS 常见 bug），?? 兜不住，需显式回退；
      // 回退顺序：link 路径最后一段 slug（如 langchain 空标题条的 slug 即完整标题）→ 占位符
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- 空串也算缺失，必须用 || 而非 ??
      title: rawTitle.trim() || fallbackTitle(link) || "(无标题)",
      description,
      link,
      guid,
      pubDate: normalizeDate(rawDate),
      ...(author ? { author: String(author) } : {}),
      ...(category ? { category } : {}),
      ...(image ? { image } : {}),
    });
  }

  const feedTitle = typeof feed["title"] === "string" ? feed["title"] : undefined;
  return { items, ...(feedTitle !== undefined ? { title: feedTitle } : {}) };
}

// 空标题兜底：取 link 路径最后一段 slug（如 "building-monday-com-sidekick"），连字符转空格；
// 中文/无 slug 时返回空串，由调用方继续兜底占位符
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
    // 优先从 Media RSS 命名空间的缩略图列表提取
    if (Array.isArray(media["thumbnails"]) && media["thumbnails"][0]) {
      const firstThumb = media["thumbnails"][0] as Record<string, unknown>;
      const url = firstThumb["url"];
      if (typeof url === "string" && url) return url;
    }
    // 其次尝试 Media RSS 媒体内容列表
    if (Array.isArray(media["contents"]) && media["contents"][0]) {
      const firstContent = media["contents"][0] as Record<string, unknown>;
      const url = firstContent["url"];
      if (typeof url === "string" && url) return url;
    }
    // 尝试 Media RSS 媒体分组中的子内容
    if (Array.isArray(media["groups"]) && media["groups"][0]) {
      const group = media["groups"][0] as Record<string, unknown>;
      if (Array.isArray(group["contents"]) && group["contents"][0]) {
        const firstGroupContent = group["contents"][0] as Record<string, unknown>;
        const url = firstGroupContent["url"];
        if (typeof url === "string" && url) return url;
      }
    }
    // 兜底读取媒体直链或 XML 属性中的 URL
    const rawUrl =
      typeof media["url"] === "string"
        ? media["url"]
        : (media["$"] as Record<string, unknown> | undefined)?.["url"];
    if (typeof rawUrl === "string" && rawUrl) return rawUrl;
  }

  // 提取 MIME 类型为图片的 enclosure 附件
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

  // 提取 iTunes 播客扩展的图片标签（itunes:image）
  const itunes = item["itunes"] as Record<string, unknown> | undefined;
  if (itunes && typeof itunes === "object") {
    if (typeof itunes["image"] === "string" && itunes["image"]) return itunes["image"];
    if (itunes["image"] && typeof itunes["image"] === "object") {
      const href = (itunes["image"] as Record<string, unknown>)["href"];
      if (typeof href === "string" && href) return href;
    }
  }

  // 兜底提取条目顶层的 image 字段
  if (typeof item["image"] === "string" && item["image"]) return item["image"];
  if (item["image"] && typeof item["image"] === "object") {
    const imgUrl = (item["image"] as Record<string, unknown>)["url"];
    if (typeof imgUrl === "string" && imgUrl) return imgUrl;
  }

  return undefined;
}

async function upsertFeeds(sourceId: string, items: ParsedRssItem[]): Promise<number> {
  const now = new Date().toISOString();
  let inserted = 0;

  for (const item of items) {
    const [existing] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.sourceId, sourceId), eq(feeds.guid, item.guid)))
      .limit(1);
    if (existing) continue;

    await db.insert(feeds).values({
      id: randomUUID(),
      sourceId,
      title: item.title || "(无标题)",
      description: item.description || null,
      link: item.link ?? null,
      guid: item.guid,
      author: item.author ?? null,
      category: item.category ? JSON.stringify(item.category) : null,
      image: item.image ?? null,
      pubDate: item.pubDate ?? null,
      fetchedAt: now,
    });
    inserted++;
  }

  return inserted;
}

// 每次同步只处理订阅源的最新 maxItems 条，且仅接受比该源库内最新 feed 更新的条目。
// 不做全量抓取（避免一次灌入 RSS 全部历史），也不删除本地已有记录。
const MAX_ITEMS_PER_SOURCE = 10;

// 排序 → 只保留比阈值（库内最新 pubDate）严格更新的条目 → 按上限截断。
// 增量判据用时间阈值而非 guid 去重：源若在旧文章上改 guid / 补发，guid 判据
// 会把历史条目一批批重新灌入（每次同步推进 10 条直到灌满全部历史）；
// 时间阈值对这类漂移天然免疫——比库内最新还旧的条目一律不进。
// threshold 为 null（首次同步，或库内无任何带 pubDate 的条目）时全量接受前 maxItems 条。
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
  // 增量阈值 = 该来源已入库 feed 的最新 pubDate（ISO 字符串字典序即时间序；无 pubDate 的行不参与比较）。
  // 若源全部条目都无时间戳，这里恒为 null，退化为按排序截断 + upsertFeeds 内 guid 去重，行为同旧。
  const [latest] = await db
    .select({ pubDate: feeds.pubDate })
    .from(feeds)
    .where(and(eq(feeds.sourceId, sourceId), isNotNull(feeds.pubDate)))
    .orderBy(desc(feeds.pubDate))
    .limit(1);
  const fresh = pickFreshItems(items, latest?.pubDate ?? null, maxItems);
  return upsertFeeds(sourceId, fresh);
}

const ROUTE_TO_PLATFORM: Record<string, string> = {
  bili: "bilibili",
  dy: "douyin",
  xhs: "xiaohongshu",
  zh: "zhihu",
  weread: "weread",
};

export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  inserted: number;
  errors: string[];
}

export async function syncAll(): Promise<SyncResult> {
  const sources = await db.select().from(rssSources);
  const result: SyncResult = {
    total: sources.length,
    succeeded: 0,
    failed: 0,
    inserted: 0,
    errors: [],
  };

  for (const source of sources) {
    // 回填 channel.title 后合并进末尾的 lastSyncedAt 更新，避免两次写库
    let backfillTitle: string | undefined;
    try {
      if (source.type === "rss") {
        await checkSSRF(source.url);
        const res = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const { title: feedTitle, items } = await parseRssXml(xml);
        const n = await upsertFeedsLimited(source.id, items, MAX_ITEMS_PER_SOURCE);
        result.inserted += n;
        // 站点自报名称（channel.title，如 "LangChain Blog"）比创建时的域名兜底友好；
        // 仅当 title 仍是域名兜底形态时回填（用户手动改过的名不覆盖）
        if (feedTitle?.trim() && shouldBackfillTitle(source.title, source.url)) {
          backfillTitle = feedTitle.trim();
        }
      } else if (source.type === "social" && source.route) {
        const handler = getRouteHandler(source.route);
        if (!handler) throw new Error(`路由 ${source.route} 不存在`);

        const prefix = source.route.split("/")[0] ?? "";
        const platform = ROUTE_TO_PLATFORM[prefix];
        let cookies: string | undefined;
        if (platform) {
          const rows = await db
            .select({ uuid: cookieStore.uuid, cookies: cookieStore.cookies })
            .from(cookieStore)
            .where(eq(cookieStore.platform, platform));
          cookies = joinCookies(rows) || undefined;
        }

        // 增量去重：该 source 已入库的 guid 列表，传给支持 seen_guids 的路由（weread 等）
        const seenRows = await db
          .select({ guid: feeds.guid })
          .from(feeds)
          .where(eq(feeds.sourceId, source.id));
        const seenGuids = seenRows.map((r) => r.guid).filter((g): g is string => !!g);
        const baseParams = source.params ? JSON.parse(source.params) : {};

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        const routeResult = await handler({
          params: seenGuids.length > 0 ? { ...baseParams, seen_guids: seenGuids } : baseParams,
          abortSignal: controller.signal,
          // weread 增量每号最多 10 篇，maxItems 需足够大才能容纳多公众号的新增
          maxItems: source.route === "weread/shelf" ? 500 : 50,
          ...(cookies !== undefined ? { cookies } : {}),
        });
        clearTimeout(timeout);

        const { items } = await parseRssXml(routeResult.rssXml);
        const n = await upsertFeedsLimited(source.id, items, MAX_ITEMS_PER_SOURCE);
        result.inserted += n;

        // 拉取成功即 cookie 登录态可用：回写有效状态让 Cookie 面板自愈
        // （此前只有失败写 false、成功从不写 true，一次瞬时失败的"已失效"无法恢复）
        if (platform) {
          await db
            .update(cookieStore)
            .set({ valid: true, checkedAt: new Date().toISOString() })
            .where(eq(cookieStore.platform, platform));
        }
      }

      const now = new Date().toISOString();
      await db
        .update(rssSources)
        .set({
          lastSyncedAt: now,
          updatedAt: now,
          ...(backfillTitle ? { title: backfillTitle } : {}),
        })
        .where(eq(rssSources.id, source.id));

      result.succeeded++;
    } catch (err) {
      // 爬虫显式判定登录态失效才落库 false；网络波动等不定论，避免误报引导用户重登
      if (err instanceof CrawlerAuthError) {
        const platform = source.route
          ? ROUTE_TO_PLATFORM[source.route.split("/")[0] ?? ""]
          : undefined;
        if (platform) {
          await db
            .update(cookieStore)
            .set({ valid: false, checkedAt: new Date().toISOString() })
            .where(eq(cookieStore.platform, platform))
            .catch(() => {});
        }
      }
      logger.error({ err, sourceId: source.id }, "同步失败");
      result.failed++;
      result.errors.push(`${source.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
