import path from "node:path";
import {
  buildConceptContent,
  normalizeConceptId,
  parseFrontmatter,
  extractConceptLinks,
} from "@feedmind/wiki-core";
import type {
  WikiPageCreate,
  WikiPageListItem,
  WikiPageRead,
  WikiPageUpdate,
  WikiResolveResult,
} from "@feedmind/contracts";
import { HttpError } from "../../../lib/http.js";
import {
  dateSortDesc,
  ensureDir,
  nowISO,
  safeRename,
  safeUnlink,
  safeWriteFile,
  getSpaceDir,
  invalidatePageCache,
  findPageById,
  walkPages,
  readPage,
  readPageListItem,
  readPageRaw,
  normalizePageRelPath,
} from "../space-fs/index.js";
import { appendOkfLog, rebuildOkfIndexes } from "./okf-ops.js";

function toWikiPageRead(data: Record<string, unknown>): WikiPageRead {
  return data as unknown as WikiPageRead;
}

// 编辑器保存的写入者标识（OKF v0.2 actor 约定：human:）
const EDIT_ACTOR = "human:user";

function buildPageFile(
  type: string,
  title: string,
  description: string | undefined,
  resource: string | undefined,
  tags: string[] | undefined,
  frontmatter: Record<string, unknown> | undefined,
  content: string,
): string {
  return buildConceptContent({
    type,
    title,
    generated: { by: EDIT_ACTOR, at: nowISO() },
    content,
    ...(description !== undefined ? { description } : {}),
    ...(resource !== undefined ? { resource } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(frontmatter !== undefined ? { frontmatter } : {}),
  });
}

export async function listWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number; offset?: number },
): Promise<{ items: WikiPageListItem[]; total: number }> {
  const items: WikiPageListItem[] = [];
  for (const filePath of walkPages(spaceId)) {
    const data = readPageListItem(filePath, spaceId);
    if (!data) continue;
    const item = data as unknown as WikiPageListItem;
    if (opts?.type && item.type !== opts.type) continue;
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.path.toLowerCase().includes(q) &&
        !item.concept_id.toLowerCase().includes(q)
      ) {
        continue;
      }
    }
    items.push(item);
  }

  items.sort((a, b) => dateSortDesc(a.timestamp, b.timestamp));
  const total = items.length;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return { items: items.slice(offset, offset + limit), total };
}

export async function getWikiPage(spaceId: string, pageId: string): Promise<WikiPageRead> {
  const filePath = findPageById(spaceId, pageId);
  if (!filePath)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "页面不存在",
      {},
      { i18nKey: "apiError.wikiPageNotFound" },
    );
  const data = readPage(filePath, spaceId);
  if (!data)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "页面不存在",
      {},
      { i18nKey: "apiError.wikiPageNotFound" },
    );
  return toWikiPageRead(data);
}

export async function createWikiPage(
  spaceId: string,
  payload: WikiPageCreate,
): Promise<WikiPageRead> {
  const normalizedPath = normalizePageRelPath(payload.path);
  const absPath = path.join(getSpaceDir(spaceId), normalizedPath);

  // 目标已存在时报 409
  if (readPageRaw(absPath) !== null) {
    throw new HttpError(
      409,
      "HTTP_ERROR",
      "同名页面已存在",
      {},
      { i18nKey: "apiError.wikiPageExists" },
    );
  }

  ensureDir(path.dirname(absPath));

  const content = buildPageFile(
    payload.type,
    payload.title,
    payload.description,
    payload.resource,
    payload.tags,
    payload.frontmatter,
    payload.content,
  );

  safeWriteFile(absPath, content);
  invalidatePageCache(spaceId);
  rebuildOkfIndexes(spaceId);
  appendOkfLog(spaceId, `创建概念“${payload.path}”。`);

  const parsedData = readPage(absPath, spaceId);
  if (!parsedData)
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "页面创建失败，请重试",
      {},
      { i18nKey: "apiError.wikiPageCreateFailed" },
    );
  return toWikiPageRead(parsedData);
}

export async function updateWikiPage(
  spaceId: string,
  pageId: string,
  payload: WikiPageUpdate,
): Promise<WikiPageRead> {
  const filePath = findPageById(spaceId, pageId);
  if (!filePath)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "页面不存在",
      {},
      { i18nKey: "apiError.wikiPageNotFound" },
    );
  const existingData = readPage(filePath, spaceId);
  if (!existingData)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "页面不存在",
      {},
      { i18nKey: "apiError.wikiPageNotFound" },
    );
  const existing = toWikiPageRead(existingData);

  const frontmatter = {
    ...existing.frontmatter,
    ...(payload.frontmatter ?? {}),
  };
  const nextPath = payload.path ?? existing.path;
  const normalizedPath = normalizePageRelPath(nextPath);
  const nextFilePath = path.join(getSpaceDir(spaceId), normalizedPath);

  if (nextFilePath !== filePath && readPageRaw(nextFilePath) !== null) {
    throw new HttpError(
      409,
      "HTTP_ERROR",
      "同名页面已存在",
      {},
      { i18nKey: "apiError.wikiPageExists" },
    );
  }

  const content = buildPageFile(
    payload.type ?? existing.type,
    payload.title ?? existing.title,
    payload.description ?? existing.description,
    payload.resource ?? existing.resource ?? undefined,
    payload.tags ?? existing.tags,
    frontmatter,
    payload.content ?? existing.content,
  );

  if (nextFilePath !== filePath) {
    ensureDir(path.dirname(nextFilePath));
    safeRename(filePath, nextFilePath);
  }
  safeWriteFile(nextFilePath, content);
  invalidatePageCache(spaceId);
  rebuildOkfIndexes(spaceId);
  appendOkfLog(spaceId, `更新概念“${pageId}”。`);

  const data = readPage(nextFilePath, spaceId);
  if (!data)
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "页面更新失败，请重试",
      {},
      { i18nKey: "apiError.wikiPageUpdateFailed" },
    );
  return toWikiPageRead(data);
}

export async function deleteWikiPage(spaceId: string, pageId: string): Promise<void> {
  const filePath = findPageById(spaceId, pageId);
  if (!filePath)
    throw new HttpError(
      404,
      "HTTP_ERROR",
      "页面不存在",
      {},
      { i18nKey: "apiError.wikiPageNotFound" },
    );
  safeUnlink(filePath);
  invalidatePageCache(spaceId);
  rebuildOkfIndexes(spaceId);
  appendOkfLog(spaceId, `删除概念“${pageId}”。`);
}

export async function resolveWikiLink(spaceId: string, target: string): Promise<WikiResolveResult> {
  const pages = walkPages(spaceId)
    .map((filePath) => readPage(filePath, spaceId))
    .filter((page): page is Record<string, unknown> => page !== null);
  let decodedTarget = target;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    /* 查询参数已经是普通文本时直接使用。 */
  }
  const pathTarget = decodedTarget.split(/[?#]/, 1)[0]?.trim() ?? "";
  const normalizedTarget = normalizeConceptId(pathTarget);
  const exact = pages.find((page) => page["concept_id"] === normalizedTarget);
  if (exact) return resolvedPage(exact);

  const matches = pages.filter((page) => {
    const title = String(page["title"]).toLowerCase();
    return (
      title === pathTarget.toLowerCase() ||
      String(page["slug"]).toLowerCase() === pathTarget.toLowerCase()
    );
  });
  if (matches.length === 1) return resolvedPage(matches[0]!);
  if (matches.length > 1) {
    return {
      resolved: false,
      page_id: null,
      slug: null,
      title: null,
      status: "ambiguous",
      candidates: matches.map(candidatePage),
    };
  }

  return {
    resolved: false,
    page_id: null,
    slug: null,
    title: null,
    status: "missing",
    candidates: [],
  };
}

function resolvedPage(page: Record<string, unknown>): WikiResolveResult {
  return {
    resolved: true,
    page_id: String(page["id"]),
    slug: String(page["slug"]),
    title: String(page["title"]),
    status: "resolved",
    candidates: [],
  };
}

function candidatePage(page: Record<string, unknown>) {
  return {
    page_id: String(page["id"]),
    path: String(page["path"]),
    title: String(page["title"]),
    slug: String(page["slug"]),
  };
}

export async function getWikiBacklinks(
  spaceId: string,
  pageId: string,
): Promise<Array<{ page_id: string; slug: string; title: string; path: string }>> {
  const backlinks: Array<{ page_id: string; slug: string; title: string; path: string }> = [];
  let decodedPageId = pageId;
  try {
    decodedPageId = decodeURIComponent(pageId);
  } catch {
    /* 路由参数已经是普通文本时直接使用。 */
  }
  const targetId = normalizeConceptId(decodedPageId);
  for (const filePath of walkPages(spaceId)) {
    const page = readPage(filePath, spaceId);
    if (!page || page["id"] === targetId) continue;

    const raw = readPageRaw(filePath);
    if (!raw) continue;
    const { body } = parseFrontmatter(raw);
    const links = extractConceptLinks(body, String(page["concept_id"]));
    if (links.includes(targetId)) {
      backlinks.push({
        page_id: String(page["id"]),
        slug: String(page["slug"]),
        title: String(page["title"]),
        path: String(page["path"]),
      });
    }
  }
  return backlinks;
}
