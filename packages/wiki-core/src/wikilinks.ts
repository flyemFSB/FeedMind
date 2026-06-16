const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/**
 * 从内容中提取 wikilink 目标，跳过代码 fence 块。
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  // 先移除代码 fence 块
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const regex = new RegExp(WIKILINK_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

/** 提取 wikilink 及其显示文字 */
export function extractWikilinksWithAlias(
  content: string,
): Array<{ target: string; alias: string | null }> {
  const links: Array<{ target: string; alias: string | null }> = [];
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const regex = new RegExp(WIKILINK_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    links.push({ target: match[1].trim(), alias: match[2]?.trim() ?? null });
  }
  return links;
}

/** 标准化 wikilink 目标用于匹配（小写、连字符化） */
export function normalizeWikilinkTarget(target: string): string {
  return target.toLowerCase().replace(/\s+/g, "-");
}

/**
 * 将 wikilink 目标解析为已知页面 slug。
 * 返回匹配的 slug 或 null。
 */
export function resolveWikilink(target: string, knownSlugs: Set<string>): string | null {
  if (knownSlugs.has(target)) return target;

  const normalized = normalizeWikilinkTarget(target);
  for (const slug of knownSlugs) {
    if (slug.toLowerCase() === normalized) return slug;
    if (normalizeWikilinkTarget(slug) === normalized) return slug;
  }
  return null;
}

/**
 * 剥离指向已删除页面的 wikilink，替换为纯文字。
 */
export function stripDeletedWikilinks(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text;
  return text.replace(WIKILINK_REGEX, (match, target: string, display?: string) => {
    const key = normalizeWikilinkTarget(target.trim());
    if (!deletedKeys.has(key)) return match;
    return display ?? target;
  });
}

/** 标准化标签用于比较（小写，去连字符/空格） */
export function normalizeWikiRefKey(s: string): string {
  const normalized = s.trim().replace(/\\/g, "/");
  const leaf = normalized.split("/").pop() ?? normalized;
  const withoutMd = leaf.toLowerCase().endsWith(".md") ? leaf.slice(0, -3) : leaf;
  return withoutMd.toLowerCase().replace(/[\s\-_]+/g, "");
}

/** 构建已删除页面的标准化键查询集 */
export function buildDeletedKeys(infos: Array<{ slug: string; title: string }>): Set<string> {
  const keys = new Set<string>();
  for (const info of infos) {
    if (info.slug) keys.add(normalizeWikiRefKey(info.slug));
    if (info.title) keys.add(normalizeWikiRefKey(info.title));
  }
  return keys;
}

/** 清理 index.md 列表中指向已删除页面的行 */
export function cleanIndexListing(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text;
  const INDEX_ENTRY_RE = /^\s*[-*]\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/;
  return text
    .split("\n")
    .filter((line) => {
      const m = line.match(INDEX_ENTRY_RE);
      if (!m) return true;
      return !deletedKeys.has(normalizeWikiRefKey(m[1].trim()));
    })
    .join("\n");
}
