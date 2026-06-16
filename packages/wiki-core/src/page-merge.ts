import { parseFrontmatter, formatFrontmatter } from "./frontmatter.js";

/**
 * 合并两套 frontmatter 数组字段（sources、tags、related）。
 * 基于并集，保留首次出现的大小写。
 */
export function mergeArrays(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (items: string[]) => {
    for (const item of items) {
      const key = item.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item.trim());
      }
    }
  };

  add(existing);
  add(incoming);

  return result;
}

/**
 * 合并两套 Wiki 页面内容。返回合并后的内容字符串。
 */
export function mergePageContent(
  existing: string | null,
  incoming: string,
  sourceFileName: string,
): string {
  if (!existing) return incoming;

  const { frontmatter: existingFm, body: existingBody } = parseFrontmatter(existing);
  const { frontmatter: incomingFm, body: incomingBody } = parseFrontmatter(incoming);

  // 锁定字段：保留已有的 type/title/created
  const type = (existingFm.type as string) ?? (incomingFm.type as string) ?? "concept";
  const title = (existingFm.title as string) ?? (incomingFm.title as string) ?? "";
  const created = (existingFm.created as string) ?? (incomingFm.created as string) ?? nowDate();

  // Merge array fields
  const tags = mergeArrays(
    (existingFm.tags as string[]) ?? [],
    (incomingFm.tags as string[]) ?? [],
  );
  const sources = mergeArrays(
    (existingFm.sources as string[]) ?? [],
    (incomingFm.sources as string[]) ?? [],
  );
  // 确保当前来源在 sources 列表中
  if (sourceFileName && !sources.some((s) => s.toLowerCase() === sourceFileName.toLowerCase())) {
    sources.push(sourceFileName);
  }

  const related = mergeArrays(
    (existingFm.related as string[]) ?? [],
    (incomingFm.related as string[]) ?? [],
  );

  // 优先保留更长的 body（通常内容更丰富）
  const body =
    existingBody.trim().length >= incomingBody.trim().length
      ? existingBody.trim()
      : incomingBody.trim();

  const fm: Record<string, unknown> = {
    type,
    title,
    tags,
    sources,
    related,
    created,
    updated: nowDate(),
  };

  return formatFrontmatter(fm) + "\n" + body;
}

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}
