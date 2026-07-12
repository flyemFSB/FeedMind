import { randomUUID } from "node:crypto";
import { client } from "@feedmind/db";
import { getRouteHandler } from "@feedmind/crawler-core";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";

interface FeedRow {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  link: string | null;
  guid: string;
  author: string | null;
  category: string | null;
  image: string | null;
  pub_date: string | null;
  fetched_at: string;
  is_read: number;
  created_at: string;
}

function toFeed(r: any): FeedRow {
  return {
    id: r.id,
    source_id: r.source_id,
    title: r.title,
    description: r.description ?? null,
    link: r.link ?? null,
    guid: r.guid,
    author: r.author ?? null,
    category: r.category ?? null,
    image: r.image ?? null,
    pub_date: r.pub_date ?? null,
    fetched_at: r.fetched_at,
    is_read: r.is_read,
    created_at: r.created_at,
  };
}

export async function listFeeds(params: {
  source_id?: string;
  offset: number;
  limit: number;
}): Promise<{ data: FeedRow[]; total: number }> {
  let countSql = "SELECT count(*) as count FROM feeds";
  let dataSql = "SELECT * FROM feeds";
  const binds: unknown[] = [];

  if (params.source_id) {
    const where = " WHERE source_id = ?";
    countSql += where;
    dataSql += where;
    binds.push(params.source_id);
  }

  dataSql += " ORDER BY COALESCE(pub_date, fetched_at) DESC, fetched_at DESC LIMIT ? OFFSET ?";
  const limitBinds = [...binds, params.limit, params.offset];

  const [countResult, dataResult] = await Promise.all([
    client.execute({ sql: countSql, args: binds as any[] }),
    client.execute({ sql: dataSql, args: limitBinds as any[] }),
  ]);

  return {
    data: dataResult.rows.map(toFeed),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function markRead(feedId: string): Promise<void> {
  const result = await client.execute({ sql: "SELECT id FROM feeds WHERE id = ?", args: [feedId] });
  if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "条目不存在");
  await client.execute({ sql: "UPDATE feeds SET is_read = 1 WHERE id = ?", args: [feedId] });
}

export async function markAllRead(sourceId: string): Promise<void> {
  await client.execute({
    sql: "UPDATE feeds SET is_read = 1 WHERE source_id = ?",
    args: [sourceId],
  });
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
      return (m?.[1] || m?.[2] || "").trim();
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
    const existing = await client.execute({
      sql: "SELECT id FROM feeds WHERE source_id = ? AND guid = ?",
      args: [sourceId, item.guid],
    });
    if (existing.rows[0]) continue;

    await client.execute({
      sql: `INSERT INTO feeds (id, source_id, title, description, link, guid, author, category, image, pub_date, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        sourceId,
        item.title || "(无标题)",
        item.description || null,
        item.link || null,
        item.guid,
        item.author || null,
        item.category ? JSON.stringify(item.category) : null,
        item.image || null,
        item.pubDate || null,
        now,
      ],
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
  const sourcesResult = await client.execute("SELECT * FROM rss_sources");
  const sources = sourcesResult.rows as any[];
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
        const cookies = platform
          ? (
              await client.execute({
                sql: "SELECT cookies FROM cookie_store WHERE platform = ?",
                args: [platform],
              })
            ).rows
              .map((r: any) => r.cookies)
              .join("; ")
          : undefined;

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

      await client.execute({
        sql: "UPDATE rss_sources SET last_synced_at = ?, updated_at = ? WHERE id = ?",
        args: [new Date().toISOString(), new Date().toISOString(), source.id],
      });

      result.succeeded++;
    } catch (err) {
      logger.error({ err, sourceId: source.id }, "同步失败");
      result.failed++;
      result.errors.push(`${source.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
