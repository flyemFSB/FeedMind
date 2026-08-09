import type { LintResult } from "@feedmind/contracts";
import { extractGeneratedAt, extractString, extractType, parseFrontmatter } from "./frontmatter.js";
import { conceptIdFromPath, extractConceptLinks } from "./links.js";
import { getRelativePath } from "./paths.js";

export interface LintPage {
  path: string;
  content: string;
}

const DATE_HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm;

function readLogDates(body: string): string[] {
  return [...body.matchAll(DATE_HEADING_RE)].map((match) => match[1] ?? "");
}

/** 检查 OKF v0.2 的必要结构，并将软约束作为提示返回。 */
export function runOkfLint(pages: LintPage[], bundleRoot: string): LintResult[] {
  const concepts = new Map<string, LintPage>();
  const reserved = new Set<string>();
  for (const page of pages) {
    const relativePath = getRelativePath(page.path, bundleRoot);
    const fileName = relativePath.split("/").at(-1) ?? relativePath;
    const reservedName = fileName.toLowerCase();
    if (reservedName !== "index.md" && reservedName !== "log.md") {
      concepts.set(conceptIdFromPath(relativePath), page);
    } else {
      reserved.add(conceptIdFromPath(relativePath));
    }
  }

  const inbound = new Map<string, number>();
  const outbound = new Map<string, string[]>();
  for (const conceptId of concepts.keys()) inbound.set(conceptId, 0);

  const results: LintResult[] = [];
  for (const page of pages) {
    const relativePath = getRelativePath(page.path, bundleRoot);
    const fileName = relativePath.split("/").at(-1) ?? relativePath;
    const reservedName = fileName.toLowerCase();
    const shortName = relativePath;
    const parsed = parseFrontmatter(page.content);

    if (reservedName === "index.md") {
      if (parsed.hasFrontmatter) {
        const isRoot = relativePath.toLowerCase() === "index.md";
        const version = parsed.frontmatter["okf_version"];
        const keys = Object.keys(parsed.frontmatter);
        const hasOnlyVersion = keys.every((key) => key === "okf_version");
        if (
          !parsed.valid ||
          !isRoot ||
          !hasOnlyVersion ||
          (version !== undefined && version !== "0.2")
        ) {
          results.push({
            type: "conformance",
            severity: "warning",
            page: shortName,
            detail: 'index.md 的 frontmatter 只能包含根索引版本号 okf_version: "0.2"。',
          });
        }
      }
      if (!/^#{1,6}\s+\S/m.test(parsed.body)) {
        results.push({
          type: "conformance",
          severity: "warning",
          page: shortName,
          detail: "index.md 应至少包含一个 Markdown 标题。",
        });
      }
      continue;
    }

    if (reservedName === "log.md") {
      if (parsed.hasFrontmatter) {
        results.push({
          type: "conformance",
          severity: "warning",
          page: shortName,
          detail: "log.md 不应包含 frontmatter。",
        });
      }
      if (!/##\s+\d{4}-\d{2}-\d{2}/.test(parsed.body)) {
        results.push({
          type: "conformance",
          severity: "info",
          page: shortName,
          detail: "log.md 应按 ISO 8601 日期标题分组记录。",
        });
      } else {
        const dates = readLogDates(parsed.body);
        if (dates.some((date, index) => index > 0 && date > (dates[index - 1] ?? ""))) {
          results.push({
            type: "conformance",
            severity: "warning",
            page: shortName,
            detail: "log.md 的日期分组应按最新日期在前排序。",
          });
        }
      }
      continue;
    }

    const conceptId = conceptIdFromPath(relativePath);
    if (!parsed.hasFrontmatter || !parsed.valid) {
      results.push({
        type: "conformance",
        severity: "warning",
        page: shortName,
        detail: parsed.error ?? "每个 OKF Concept 都必须包含可解析的 YAML frontmatter。",
      });
    }

    const type = extractType(page.content);
    if (!type) {
      results.push({
        type: "conformance",
        severity: "warning",
        page: shortName,
        detail: "每个 OKF Concept 都必须包含非空的 type 字段。",
      });
    }

    if (
      extractGeneratedAt(parsed.frontmatter) === undefined &&
      extractString(parsed.frontmatter, "timestamp") !== undefined
    ) {
      results.push({
        type: "conformance",
        severity: "warning",
        page: shortName,
        detail: "OKF v0.2 已用 generated: { by, at } 取代 timestamp 字段，请迁移。",
      });
    }

    const links = extractConceptLinks(parsed.body, conceptId);
    outbound.set(conceptId, links);
    for (const target of links) {
      if (!concepts.has(target) && !reserved.has(target)) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: shortName,
          detail: `Markdown 链接目标不存在：${target}。`,
        });
      } else {
        inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    }
  }

  for (const [conceptId, page] of concepts) {
    const relativePath = getRelativePath(page.path, bundleRoot);
    const links = outbound.get(conceptId) ?? [];
    if ((inbound.get(conceptId) ?? 0) === 0) {
      results.push({
        type: "orphan",
        severity: "info",
        page: relativePath,
        detail: "没有其他 Concept 链接到此 Concept。",
      });
    }
    if (links.length === 0) {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: relativePath,
        detail: "此 Concept 没有指向其他 Concept 的 Markdown 链接。",
      });
    }
  }

  return results;
}
