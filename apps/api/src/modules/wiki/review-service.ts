import fs from "node:fs";
import path from "node:path";
import type { ReviewItem } from "@feedmind/contracts";
import { spaceDir, ensureLlmWikiDir } from "./wiki-utils.js";

function reviewPath(spaceId: string): string {
  return path.join(spaceDir(spaceId), ".llm-wiki", "review.json");
}

function readItems(spaceId: string): ReviewItem[] {
  try {
    return JSON.parse(fs.readFileSync(reviewPath(spaceId), "utf-8"));
  } catch {
    return [];
  }
}

function writeItems(spaceId: string, items: ReviewItem[]): void {
  ensureLlmWikiDir(spaceId);
  fs.writeFileSync(reviewPath(spaceId), JSON.stringify(items, null, 2), "utf-8");
}

export async function listReviewItems(spaceId: string): Promise<ReviewItem[]> {
  return readItems(spaceId);
}

export async function addReviewItems(spaceId: string, items: ReviewItem[]): Promise<void> {
  const existing = readItems(spaceId);

  // 按 type + title 去重
  const seen = new Set(existing.map((r) => `${r.type}:${r.title.toLowerCase()}`));
  const newItems = items.filter((r) => !seen.has(`${r.type}:${r.title.toLowerCase()}`));

  if (newItems.length === 0) return;
  writeItems(spaceId, [...existing, ...newItems]);
}

export async function resolveReviewItem(spaceId: string, itemId: string): Promise<void> {
  const items = readItems(spaceId);
  const updated = items.map((r) => (r.id === itemId ? { ...r, resolved: true } : r));
  writeItems(spaceId, updated);
}

export async function dismissReviewItem(spaceId: string, itemId: string): Promise<void> {
  const items = readItems(spaceId);
  writeItems(
    spaceId,
    items.filter((r) => r.id !== itemId),
  );
}

export async function sweepReviewItems(spaceId: string): Promise<number> {
  // 自动解决其影响页面已不存在的审查项
  const items = readItems(spaceId);
  let swept = 0;

  const resolved = items.map((r) => {
    if (r.resolved) return r;
    // 若所有影响页面已不存在，自动标记为已解决
    if (r.affectedPages.length > 0) {
      const allMissing = r.affectedPages.every((p) => {
        const fullPath = path.join(spaceDir(spaceId), p);
        return !fs.existsSync(fullPath);
      });
      if (allMissing) {
        swept++;
        return { ...r, resolved: true };
      }
    }
    return r;
  });

  writeItems(spaceId, resolved);
  return swept;
}
