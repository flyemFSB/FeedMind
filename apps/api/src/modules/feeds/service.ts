import { randomUUID } from "node:crypto";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, feeds, rssSources, cookieStore } from "@feedmind/db";
import type { FeedRow } from "@feedmind/db";
import { getRouteHandler } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";

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
  if (!existing) throw new HttpError(404, "NOT_FOUND", "条目不存在");
  await db.update(feeds).set({ isRead: 1 }).where(eq(feeds.id, feedId));
}

export async function markAllRead(sourceId: string): Promise<void> {
  await db.update(feeds).set({ isRead: 1 }).where(eq(feeds.sourceId, sourceId));
}

// ─── 同步 ─────────────────────────────────────────────────────

interface ParsedRssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
  author?: string;
  category?: string[];
  image?: string;
}

function parseRssXml(xml: string): { title?: string; items: ParsedRssItem[] } {
  const items: ParsedRssItem[] = [];

  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
  if (!channelMatch) return { items };

  const channelTitle = channelMatch[1].match(
    /<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i,
  )?.[1];

  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];
    const extract = (tag: string): string => {
      const m = block.match(
        new RegExp(
          `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
          "i",
        ),
      );
      return (m?.[1] ?? m?.[2] ?? "").trim();
    };
    const link = extract("link");
    const guid = extract("guid") || link;
    if (!guid) continue;

    const catBlock = block.match(
      /<category>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/category>/gi,
    );
    const cats: string[] = [];
    if (catBlock) {
      for (const c of catBlock) {
        const m = c.match(/(?:<!\[CDATA\[([\s\S]*?)\]\]>|>([\s\S]*?)<\/category>)/);
        if (m?.[1] || m?.[2]) cats.push((m[1] || m[2]).trim());
      }
    }

    items.push({
      title: extract("title"),
      description: extract("description"),
      link,
      guid,
      pubDate: extract("pubDate"),
      author: extract("author"),
      category: cats.length > 0 ? cats : undefined,
      image: extract("image"),
    });
  }

  return { title: channelTitle, items };
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
      pubDate: item.pubDate || null,
      fetchedAt: now,
    });
    inserted++;
  }

  return inserted;
}

const ROUTE_TO_PLATFORM: Record<string, string> = {
  bili: "bilibili",
  dy: "douyin",
  xhs: "xiaohongshu",
  zh: "zhihu",
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
    try {
      if (source.type === "rss") {
        const res = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const { items } = parseRssXml(xml);
        const n = await upsertFeeds(source.id, items);
        result.inserted += n;
      } else if (source.type === "social" && source.route) {
        const handler = getRouteHandler(source.route);
        if (!handler) throw new Error(`路由 ${source.route} 不存在`);

        const prefix = source.route.split("/")[0];
        const platform = ROUTE_TO_PLATFORM[prefix];
        let cookies: string | undefined;
        if (platform) {
          const rows = await db
            .select({ cookies: cookieStore.cookies })
            .from(cookieStore)
            .where(eq(cookieStore.platform, platform));
          cookies = rows.map((r) => r.cookies).join("; ") || undefined;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        const routeResult = await handler({
          params: source.params ? JSON.parse(source.params) : {},
          cookies,
          abortSignal: controller.signal,
          maxItems: 50,
        });
        clearTimeout(timeout);

        const { items } = parseRssXml(routeResult.rssXml);
        const n = await upsertFeeds(source.id, items);
        result.inserted += n;
      }

      const now = new Date().toISOString();
      await db
        .update(rssSources)
        .set({ lastSyncedAt: now, updatedAt: now })
        .where(eq(rssSources.id, source.id));

      result.succeeded++;
    } catch (err) {
      logger.error({ err, sourceId: source.id }, "同步失败");
      result.failed++;
      result.errors.push(`${source.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
