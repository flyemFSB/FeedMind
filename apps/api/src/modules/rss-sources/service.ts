import { randomUUID } from "node:crypto";
import { client } from "@feedmind/db";
import type { RssSourceCreate, RssSourceUpdate } from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";

interface Row {
  id: string;
  type: string;
  platform: string | null;
  route: string | null;
  url: string;
  title: string;
  params: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRow(r: any): Row {
  return {
    id: r.id,
    type: r.type,
    platform: r.platform ?? null,
    route: r.route ?? null,
    url: r.url,
    title: r.title,
    params: r.params ?? null,
    last_synced_at: r.last_synced_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listSources(): Promise<Row[]> {
  const result = await client.execute("SELECT * FROM rss_sources ORDER BY created_at");
  return result.rows.map(toRow);
}

export async function getSource(id: string): Promise<Row> {
  const result = await client.execute({
    sql: "SELECT * FROM rss_sources WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "NOT_FOUND", "订阅源不存在");
  return toRow(row);
}

export async function createSource(input: RssSourceCreate): Promise<Row> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title =
    input.title || input.type === "rss"
      ? new URL(input.url).hostname
      : `${input.platform || "社交"} - ${input.url}`;

  await client.execute({
    sql: `INSERT INTO rss_sources (id, type, platform, route, url, title, params, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.type,
      input.platform ?? null,
      input.route ?? null,
      input.url,
      title,
      input.params ? JSON.stringify(input.params) : null,
      now,
      now,
    ],
  });

  return getSource(id);
}

export async function updateSource(id: string, input: RssSourceUpdate): Promise<Row> {
  const row = await getSource(id);
  const newTitle = input.title ?? row.title;
  await client.execute({
    sql: "UPDATE rss_sources SET title = ?, updated_at = ? WHERE id = ?",
    args: [newTitle, new Date().toISOString(), id],
  });
  return getSource(id);
}

export async function deleteSource(id: string): Promise<void> {
  const result = await client.execute({
    sql: "SELECT id FROM rss_sources WHERE id = ?",
    args: [id],
  });
  if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "订阅源不存在");
  await client.execute({ sql: "DELETE FROM rss_sources WHERE id = ?", args: [id] });
}
