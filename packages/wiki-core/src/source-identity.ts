import { normalizePath, getFileName } from "./paths.js";

/**
 * 从项目相对路径计算稳定的来源标识。
 * 保留 raw/sources/ 下的相对路径以避免名称冲突。
 */
export function sourceIdentityForPath(projectPath: string, sourcePath: string): string {
  const pp = normalizePath(projectPath);
  const sp = normalizePath(sourcePath);
  const prefix = `${pp}/raw/sources/`;
  if (sp.startsWith(prefix)) {
    return sp.slice(prefix.length);
  }
  // 不在 raw/sources/ 下时回退到纯文件名
  return getFileName(sp);
}

/**
 * 从来源标识生成来源摘要 slug。
 * 将非字母数字字符替换为连字符。
 */
export function sourceSummarySlugFromIdentity(identity: string): string {
  const name = getFileName(identity);
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "source"
  );
}

/** 标准化来源引用用于比较 */
export function sourceReferenceIdentity(identity: string): string {
  return normalizePath(identity).toLowerCase();
}

/** 可导入的来源文件扩展名 */
export const INGESTABLE_EXTENSIONS = new Set([
  "md",
  "txt",
  "pdf",
  "doc",
  "docx",
  "pptx",
  "xlsx",
  "xls",
  "odt",
  "odp",
  "ods",
  "csv",
  "json",
  "html",
  "htm",
  "rtf",
  "xml",
  "yaml",
  "yml",
]);

export function isIngestableExtension(fileName: string): boolean {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
  return ext ? INGESTABLE_EXTENSIONS.has(ext) : false;
}
