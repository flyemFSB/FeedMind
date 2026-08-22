import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, safeWriteFile } from "./io.js";
import { getSpaceDir, getWikiRootDir, getRegistryPath, getSpaceMetaPath } from "./paths.js";

const SPACE_SUBDIRS = ["wiki", "raw/sources", "raw/uploads", ".feedmind"];

export function createSpaceDirs(spaceId: string): void {
  const base = getSpaceDir(spaceId);
  for (const d of SPACE_SUBDIRS) {
    ensureDir(path.join(base, d));
  }
}

export async function readRegistry(): Promise<Array<Record<string, unknown>>> {
  try {
    return JSON.parse(await fs.readFile(getRegistryPath(), "utf-8"));
  } catch {
    return [];
  }
}

export function writeRegistry(registry: Array<Record<string, unknown>>): void {
  ensureDir(getWikiRootDir());
  safeWriteFile(getRegistryPath(), JSON.stringify(registry, null, 2));
}

export async function readSpaceMeta(spaceId: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(getSpaceMetaPath(spaceId), "utf-8"));
  } catch {
    return null;
  }
}

export function writeSpaceMeta(spaceId: string, meta: Record<string, unknown>): void {
  ensureDir(getSpaceDir(spaceId));
  safeWriteFile(getSpaceMetaPath(spaceId), JSON.stringify(meta, null, 2));
}

export async function deleteSpaceDir(spaceId: string): Promise<void> {
  await fs.rm(getSpaceDir(spaceId), { recursive: true, force: true });
}

export function ensureRuntimeDir(spaceId: string): void {
  ensureDir(path.join(getSpaceDir(spaceId), ".feedmind"));
}
