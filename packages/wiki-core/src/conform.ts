/**
 * OKF v0.1 Conformance Validator
 *
 * 提供 Google Open Knowledge Format v0.1 规范的合规性验证 API
 * 参考：https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */

import type { LintPage } from "./lint.js";
import { parseFrontmatter } from "./frontmatter.js";

/** 验证结果 */
export interface OkfConformanceResult {
  /** 是否完全符合规范 */
  valid: boolean;
  /** 错误列表（阻塞性） */
  errors: string[];
  /** 警告列表（建议性） */
  warnings: string[];
  /** 信息提示（最佳实践） */
  info: string[];
}

/** ISO 8601 datetime 正则表达式 */
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * 验证单个概念是否符合 OKF v0.1 规范
 */
export function validateOkfConcept(path: string, content: string): OkfConformanceResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const parsed = parseFrontmatter(content);

  // §9 Conformance Rule 1: 所有非保留文件必须包含可解析的 YAML frontmatter
  if (!parsed.hasFrontmatter || !parsed.valid) {
    errors.push(parsed.error ?? "Missing or invalid YAML frontmatter");
    return { valid: false, errors, warnings, info };
  }

  const fileName = path.split("/").pop() ?? path;
  const reservedNames = ["index.md", "log.md"];
  const isReserved = reservedNames.some((r) => r.toLowerCase() === fileName.toLowerCase());

  if (isReserved) {
    // Reserved filenames handled separately
    return { valid: true, errors: [], warnings, info };
  }

  // §9 Conformance Rule 2: 必须包含 non-empty type field
  if (
    !parsed.frontmatter.type ||
    typeof parsed.frontmatter.type !== "string" ||
    !parsed.frontmatter.type.trim()
  ) {
    errors.push("Every OKF concept must contain a non-empty 'type' field");
  }

  // Recommended: timestamp validation (§4.1)
  if (parsed.frontmatter.timestamp) {
    if (
      typeof parsed.frontmatter.timestamp !== "string" ||
      !ISO_8601_RE.test(parsed.frontmatter.timestamp)
    ) {
      warnings.push(
        `Optional 'timestamp' should be ISO 8601 format: ${parsed.frontmatter.timestamp}`,
      );
    }
  } else {
    info.push("No 'timestamp' field present (recommended for tracking changes)");
  }

  // Recommended: title field (§4.1)
  if (!parsed.frontmatter.title || typeof parsed.frontmatter.title !== "string") {
    info.push("Consider adding a 'title' field for better readability");
  }

  // Recommended: description field (§4.1)
  if (!parsed.frontmatter.description || typeof parsed.frontmatter.description !== "string") {
    info.push("Consider adding a 'description' field for summaries");
  }

  // Check body structure (§4.2)
  const trimmedBody = parsed.body.trim();
  if (trimmedBody.length === 0) {
    warnings.push("Concept body is empty; consider adding content");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

/**
 * 批量验证整个 OKF bundle
 */
export function validateOkfBundle(pages: LintPage[]): OkfConformanceResult {
  const result: OkfConformanceResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const allInfo: string[] = [];

  let rootIndexHasVersion = false;

  for (const page of pages) {
    const relativePath = page.path.split("/").reverse().join("/").split("/").slice(-2).join("/");
    const isRootIndex = relativePath.toLowerCase() === "index.md";

    if (isRootIndex) {
      const parsed = parseFrontmatter(page.content);

      // Special handling for root index.md (§11 and §6)
      if (parsed.hasFrontmatter) {
        const keys = Object.keys(parsed.frontmatter);
        const hasOnlyVersion = keys.length === 1 && keys[0] === "okf_version";

        if (hasOnlyVersion && parsed.frontmatter.okf_version === "0.1") {
          rootIndexHasVersion = true;
          continue; // OK: root index declares version
        }

        if (!hasOnlyVersion) {
          allWarnings.push(
            `${page.path}: Root index.md should only contain okf_version in frontmatter`,
          );
        } else if (parsed.frontmatter.okf_version !== "0.1") {
          allErrors.push(
            `${page.path}: Unsupported OKF version: ${parsed.frontmatter.okf_version}`,
          );
        }
      }
    }

    const conceptResult = validateOkfConcept(page.path, page.content);

    if (!conceptResult.valid) {
      allErrors.push(...conceptResult.errors.map((e) => `${page.path}: ${e}`));
    }

    allWarnings.push(...conceptResult.warnings.map((w) => `${page.path}: ${w}`));
    allInfo.push(...conceptResult.info.map((i) => `${page.path}: ${i}`));
  }

  // Bundle-level checks
  const markdownFiles = pages.filter((p) => p.path.toLowerCase().endsWith(".md"));
  const hasLog = markdownFiles.some(
    (p) => p.path.toLowerCase().includes("/log.md") || p.path.endsWith("/log.md"),
  );

  if (!hasLog) {
    allInfo.push("未发现 log.md（可选，但建议保留审计记录）");
  }

  if (!rootIndexHasVersion) {
    allInfo.push("未发现声明 okf_version 的根 index.md");
  }

  // Check for orphan concepts (not checked here, see lint.ts)
  // Check for unlinked concepts

  result.errors = allErrors;
  result.warnings = allWarnings;
  result.info = allInfo;
  result.valid = allErrors.length === 0;

  return result;
}

/**
 * 标准化时间戳格式为 ISO 8601
 */
export function normalizeTimestamp(input: string | Date): string {
  if (input instanceof Date) {
    return input.toISOString();
  }

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${input}`);
  }

  return date.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
}

/**
 * 验证是否为有效的 ISO 8601 datetime
 */
export function isValidIso8601(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!ISO_8601_RE.test(value)) return false;

  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * 生成根 index.md 的 frontmatter（仅含版本号）
 */
export function buildRootIndexFrontmatter(): string {
  return `---\nokf_version: "0.1"\n---\n`;
}
