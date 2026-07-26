import path from "node:path";
import type {
  WikiSpaceCreate,
  WikiSpaceListItem,
  WikiSpaceRead,
  WikiSpaceSettings,
  WikiSpaceUpdate,
} from "@feedmind/contracts";
import { HttpError } from "../../lib/http.js";
import {
  countFiles,
  dateSortDesc,
  nowISO,
  slugify,
  getSpaceDir,
  readRegistry,
  writeRegistry,
  readSpaceMeta,
  writeSpaceMeta,
  createSpaceDirs,
  deleteSpaceDir,
} from "./space-fs/index.js";
import { rebuildOkfIndexes } from "./okf-ops.js";

export async function listWikiSpaces(): Promise<WikiSpaceListItem[]> {
  const registry = await readRegistry();
  const items: WikiSpaceListItem[] = [];

  for (const entry of registry) {
    const spaceId = entry.id as string;
    const meta = await readSpaceMeta(spaceId);
    const pageCount = countFiles(path.join(getSpaceDir(spaceId), "wiki"), ".md");
    const sourceCount = countFiles(path.join(getSpaceDir(spaceId), "raw", "sources"));

    items.push({
      id: spaceId,
      name: (meta?.name as string) ?? (entry.name as string) ?? spaceId,
      template: (meta?.template ?? "general") as WikiSpaceListItem["template"],
      page_count: pageCount,
      source_count: sourceCount,
      created_at: (meta?.created_at as string) ?? "",
      updated_at: (meta?.updated_at as string) ?? "",
    });
  }

  return items.sort((a, b) => dateSortDesc(a.updated_at, b.updated_at));
}

export async function getWikiSpace(spaceId: string): Promise<WikiSpaceRead> {
  const meta = await readSpaceMeta(spaceId);
  if (!meta) throw new HttpError(404, "HTTP_ERROR", `Wiki space does not exist (${spaceId})`);

  return {
    id: spaceId,
    name: (meta.name as string) ?? spaceId,
    template: (meta.template ?? "general") as WikiSpaceRead["template"],
    purpose: (meta.purpose as string) ?? "",
    schema: (meta.schema as string) ?? "",
    settings: (meta.settings as WikiSpaceSettings) ?? {
      language: "zh-CN",
      enabledPageTypes: [],
      extraDirs: [],
    },
    page_count: countFiles(path.join(getSpaceDir(spaceId), "wiki"), ".md"),
    source_count: countFiles(path.join(getSpaceDir(spaceId), "raw", "sources")),
    created_at: (meta.created_at as string) ?? "",
    updated_at: (meta.updated_at as string) ?? "",
  };
}

export async function createWikiSpace(payload: WikiSpaceCreate): Promise<WikiSpaceRead> {
  const spaceId = slugify(payload.name);
  if (await readSpaceMeta(spaceId)) {
    throw new HttpError(409, "HTTP_ERROR", `Space with same name already exists (${spaceId})`);
  }

  const now = nowISO();
  const meta: Record<string, unknown> = {
    id: spaceId,
    name: payload.name,
    template: payload.template ?? "general",
    purpose: payload.purpose ?? "",
    schema: payload.schema ?? "",
    settings: { language: "zh-CN", enabledPageTypes: [], extraDirs: [] },
    created_at: now,
    updated_at: now,
  };

  writeSpaceMeta(spaceId, meta);
  createSpaceDirs(spaceId);
  rebuildOkfIndexes(spaceId);

  const registry = await readRegistry();
  registry.push({ id: spaceId, name: payload.name });
  writeRegistry(registry);

  return {
    id: spaceId,
    name: payload.name,
    template: payload.template ?? "general",
    purpose: payload.purpose ?? "",
    schema: payload.schema ?? "",
    settings: meta.settings as WikiSpaceSettings,
    page_count: 0,
    source_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export async function updateWikiSpace(
  spaceId: string,
  payload: WikiSpaceUpdate,
): Promise<WikiSpaceRead> {
  const meta = await readSpaceMeta(spaceId);
  if (!meta) throw new HttpError(404, "HTTP_ERROR", `Wiki space does not exist (${spaceId})`);

  if (payload.name !== undefined) meta.name = payload.name;
  if (payload.purpose !== undefined) meta.purpose = payload.purpose;
  if (payload.schema !== undefined) meta.schema = payload.schema;
  if (payload.settings !== undefined) {
    meta.settings = { ...(meta.settings as object), ...payload.settings };
  }
  meta.updated_at = nowISO();
  writeSpaceMeta(spaceId, meta);

  return getWikiSpace(spaceId);
}

export async function deleteWikiSpace(spaceId: string): Promise<{ success: boolean }> {
  const meta = await readSpaceMeta(spaceId);
  if (!meta) throw new HttpError(404, "HTTP_ERROR", `Wiki space does not exist (${spaceId})`);

  await deleteSpaceDir(spaceId);

  const registry = await readRegistry();
  const updated = registry.filter((e) => e.id !== spaceId);
  writeRegistry(updated);

  return { success: true };
}
