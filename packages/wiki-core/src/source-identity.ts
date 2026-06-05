import { normalizePath, getFileName } from "./paths.js";

/**
 * Compute a stable source identity from a project-relative path.
 * Preserves the relative path under raw/sources/ to avoid name collisions.
 */
export function sourceIdentityForPath(projectPath: string, sourcePath: string): string {
  const pp = normalizePath(projectPath);
  const sp = normalizePath(sourcePath);
  const prefix = `${pp}/raw/sources/`;
  if (sp.startsWith(prefix)) {
    return sp.slice(prefix.length);
  }
  // Fall back to filename if not under raw/sources/
  return getFileName(sp);
}

/**
 * Generate a source summary slug from a source identity.
 * Replaces non-alphanumeric chars with hyphens.
 */
export function sourceSummarySlugFromIdentity(identity: string): string {
  const name = getFileName(identity);
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "source";
}

/**
 * Normalize a source reference for comparison.
 */
export function sourceReferenceIdentity(identity: string): string {
  return normalizePath(identity).toLowerCase();
}

/**
 * Source file extensions that can be ingested.
 */
export const INGESTABLE_EXTENSIONS = new Set([
  "md", "txt", "pdf", "doc", "docx", "pptx", "xlsx", "xls",
  "odt", "odp", "ods", "csv", "json", "html", "htm", "rtf",
  "xml", "yaml", "yml",
]);

export function isIngestableExtension(fileName: string): boolean {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
  return ext ? INGESTABLE_EXTENSIONS.has(ext) : false;
}
