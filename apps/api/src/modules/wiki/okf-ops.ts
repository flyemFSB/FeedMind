import fs from "node:fs";
import path from "node:path";
import {
  conceptIdFromPath,
  extractString,
  formatConceptLink,
  formatFrontmatter,
  parseFrontmatter,
} from "@feedmind/wiki-core";
import {
  ensureDir,
  isSystemFile,
  readDirRecursive,
  safeUnlink,
  safeWriteFile,
} from "./space-fs/index.js";
import { getWikiDir } from "./space-fs/index.js";
import { WIKI_CONCEPT_TYPES, WIKI_CONCEPT_TYPE_LABELS } from "@feedmind/contracts";

interface ConceptEntry {
  path: string;
  conceptId: string;
  directory: string;
  type: string;
  title: string;
  description: string;
}

function readConcepts(spaceId: string): ConceptEntry[] {
  const wikiDir = getWikiDir(spaceId);
  const concepts: ConceptEntry[] = [];
  const files = readDirRecursive(
    wikiDir,
    (_filePath, name) => name.toLowerCase().endsWith(".md") && !isSystemFile(name),
  );

  for (const filePath of files) {
    try {
      const relativePath = path.relative(wikiDir, filePath).replace(/\\/g, "/");
      const { frontmatter } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
      const conceptId = conceptIdFromPath(relativePath);
      concepts.push({
        path: relativePath,
        conceptId,
        directory: path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath),
        type: extractString(frontmatter, "type") ?? "Reference",
        title:
          extractString(frontmatter, "title") ?? path.basename(relativePath).replace(/\.md$/i, ""),
        description: extractString(frontmatter, "description") ?? "",
      });
    } catch {
      /* 无法读取的文件由 OKF lint 报告，不阻塞索引重建。 */
    }
  }

  return concepts.sort((a, b) => a.conceptId.localeCompare(b.conceptId));
}

function directoriesFor(concepts: ConceptEntry[]): string[] {
  const directories = new Set<string>([""]);
  for (const concept of concepts) {
    const parts = concept.directory ? concept.directory.split("/") : [];
    for (let i = 1; i <= parts.length; i++) directories.add(parts.slice(0, i).join("/"));
  }
  return [...directories].sort((a, b) => a.split("/").length - b.split("/").length);
}

function directSubdirectories(directory: string, directories: string[]): string[] {
  const prefix = directory ? `${directory}/` : "";
  return directories
    .filter((candidate) => {
      if (!candidate.startsWith(prefix) || candidate === directory) return false;
      return candidate.slice(prefix.length).split("/").length === 1;
    })
    .sort();
}

/** 受控枚举中的位置，未知 type 归到最后。 */
function typeOrder(type: string): number {
  const index = (WIKI_CONCEPT_TYPES as readonly string[]).indexOf(type);
  return index === -1 ? WIKI_CONCEPT_TYPES.length : index;
}

function renderIndex(directory: string, concepts: ConceptEntry[], directories: string[]): string {
  const localConcepts = concepts.filter((concept) => concept.directory === directory);
  const subdirectories = directSubdirectories(directory, directories);
  const lines = ["# 知识索引", ""];

  for (const subdirectory of subdirectories) {
    const label = subdirectory.split("/").at(-1) ?? subdirectory;
    const target = path.posix.relative(directory || ".", subdirectory) || ".";
    lines.push(`- [${label}](${target}/) - OKF 概念目录。`);
  }

  const byType = new Map<string, ConceptEntry[]>();
  for (const concept of localConcepts) {
    const list = byType.get(concept.type) ?? [];
    list.push(concept);
    byType.set(concept.type, list);
  }

  const sortedTypes = [...byType.entries()].sort(
    ([a], [b]) => typeOrder(a) - typeOrder(b) || a.localeCompare(b),
  );
  for (const [type, entries] of sortedTypes) {
    const zh = WIKI_CONCEPT_TYPE_LABELS[type];
    lines.push(zh ? `## ${zh} (${type})` : `## ${type}`, "");
    for (const entry of entries) {
      const description = entry.description || "暂无描述。";
      lines.push(`- ${formatConceptLink(entry.title, entry.conceptId)} - ${description}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** 重建 OKF 根索引和所有非空子目录索引。 */
export function rebuildOkfIndexes(spaceId: string): void {
  const wikiDir = getWikiDir(spaceId);
  const concepts = readConcepts(spaceId);
  const directories = directoriesFor(concepts);
  const wanted = new Set(directories);

  for (const indexPath of readDirRecursive(
    wikiDir,
    (_filePath, name) => name.toLowerCase() === "index.md",
  )) {
    const directory = path.posix.dirname(path.relative(wikiDir, indexPath).replace(/\\/g, "/"));
    if (!wanted.has(directory === "." ? "" : directory)) safeUnlink(indexPath);
  }

  for (const directory of directories) {
    const indexPath = path.join(wikiDir, directory, "index.md");
    ensureDir(path.dirname(indexPath));
    const body = renderIndex(directory, concepts, directories);
    const content =
      directory === "" ? formatFrontmatter({ okf_version: "0.1" }) + "\n" + body : body;
    safeWriteFile(indexPath, content);
  }
}

/** 以 OKF 规定的日期分组格式追加根目录变更日志。 */
export function appendOkfLog(spaceId: string, entry: string): void {
  const logPath = path.join(getWikiDir(spaceId), "log.md");
  ensureDir(path.dirname(logPath));

  const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "";
  const today = new Date().toISOString().slice(0, 10);
  const line = `- **更新**：${entry}`;
  const heading = `## ${today}`;

  const dateHeading = new RegExp(`^${heading}$`, "m").exec(existing);
  if (dateHeading) {
    const index = dateHeading.index + dateHeading[0].length;
    const next = existing.slice(0, index) + `\n\n${line}` + existing.slice(index);
    safeWriteFile(logPath, next);
    return;
  }

  const previousEntries = existing
    .trim()
    .replace(/^# [^\r\n]*(?:\r?\n|$)/, "")
    .trim();
  const content = `# 更新日志\n\n${heading}\n\n${line}${
    previousEntries ? `\n\n${previousEntries}` : ""
  }\n`;
  safeWriteFile(logPath, content);
}
