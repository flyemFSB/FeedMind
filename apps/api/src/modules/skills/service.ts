import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SkillRead } from "@feedmind/contracts";
import { parseFrontmatter } from "@feedmind/wiki-core";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** skills 目录位于 src/mastra/skills/（与 Mastra Workspace 发现路径一致） */
const SKILLS_DIR = path.resolve(__dirname, "../../mastra/skills");

export interface UnpackedSkillMeta {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

async function ensureSkillsDir(): Promise<void> {
  await fsp.mkdir(SKILLS_DIR, { recursive: true });
}

function sanitizeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

/** 检查路径是否在 SKILLS_DIR 内（防路径穿越） */
function isInsideSkillsDir(target: string): boolean {
  const relative = path.relative(SKILLS_DIR, path.resolve(target));
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseSkillMeta(content: string): UnpackedSkillMeta {
  const { frontmatter } = parseFrontmatter(content);
  return {
    name: (frontmatter.name as string) || "",
    description: (frontmatter.description as string) || "",
    version: frontmatter.version as string | undefined,
    author: frontmatter.author as string | undefined,
  };
}

/** 列举已安装的技能 */
export async function listSkills(): Promise<SkillRead[]> {
  await ensureSkillsDir();
  const entries = await fsp.readdir(SKILLS_DIR, { withFileTypes: true });
  const items: SkillRead[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      const stat = await fsp.stat(skillDir);
      const skillMd = await fsp.readFile(skillMdPath, "utf-8").catch(() => null);
      const meta = skillMd ? parseSkillMeta(skillMd) : { name: "", description: "" };

      items.push({
        name: meta.name || entry.name,
        description: meta.description,
        version: meta.version,
        author: meta.author,
        installed_at: stat.birthtime.toISOString(),
        size: await getDirSize(skillDir),
      });
    } catch {
      // skip malformed entries
    }
  }

  return items;
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(full);
    } else if (entry.isFile()) {
      total += (await fsp.stat(full)).size;
    }
  }
  return total;
}

/** 安装技能压缩包：解压到 skills/<name>/ */
export async function installSkill(rawName: string, buffer: Buffer): Promise<SkillRead> {
  const name = sanitizeName(rawName);
  if (!name) throw new Error("Invalid skill name after sanitization.");

  await ensureSkillsDir();
  const targetDir = path.join(SKILLS_DIR, name);

  if (fs.existsSync(targetDir)) {
    throw new Error(`Skill "${name}" already exists. Delete it first to reinstall.`);
  }

  await fsp.mkdir(targetDir, { recursive: true });

  try {
    // 写入临时文件（加随机后缀防并发冲突）
    const tmpId = randomUUID();
    const tmpPath = path.join(SKILLS_DIR, `_tmp_${name}_${tmpId}.zip`);
    await fsp.writeFile(tmpPath, buffer);

    try {
      await execFileAsync("unzip", ["-o", tmpPath, "-d", targetDir], {
        timeout: 30_000,
      });
    } catch {
      throw new Error(
        "Unzip failed. Ensure 'unzip' is available on the system or add the 'adm-zip' package.",
      );
    } finally {
      await fsp.unlink(tmpPath).catch(() => {});
    }

    const skillMdPath = path.join(targetDir, "SKILL.md");
    const skillMd = await fsp.readFile(skillMdPath, "utf-8").catch(() => null);
    if (!skillMd) {
      // 也许 zip 根目录有一个子目录
      const subDirs = (await fsp.readdir(targetDir, { withFileTypes: true })).filter((e) =>
        e.isDirectory(),
      );
      for (const sub of subDirs) {
        const subMd = path.join(targetDir, sub.name, "SKILL.md");
        if (fs.existsSync(subMd)) {
          const subPath = path.join(targetDir, sub.name);
          const files = await fsp.readdir(subPath);
          for (const f of files) {
            await fsp.rename(path.join(subPath, f), path.join(targetDir, f));
          }
          await fsp.rmdir(subPath);
          break;
        }
      }
    }

    if (!fs.existsSync(path.join(targetDir, "SKILL.md"))) {
      await fsp.rm(targetDir, { recursive: true, force: true });
      throw new Error("Invalid skill archive: missing SKILL.md at root.");
    }

    const meta = parseSkillMeta(await fsp.readFile(path.join(targetDir, "SKILL.md"), "utf-8"));
    const stat = await fsp.stat(targetDir);

    return {
      name: meta.name || name,
      description: meta.description,
      version: meta.version,
      author: meta.author,
      installed_at: stat.birthtime.toISOString(),
      size: await getDirSize(targetDir),
    };
  } catch (err) {
    await fsp.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/** 删除技能 */
export async function deleteSkill(rawName: string): Promise<void> {
  const name = sanitizeName(rawName);
  if (!name) throw new Error("Invalid skill name.");

  const targetDir = path.resolve(SKILLS_DIR, name);
  if (!isInsideSkillsDir(targetDir)) {
    throw new Error("Skill name is invalid.");
  }
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Skill "${name}" not found.`);
  }
  await fsp.rm(targetDir, { recursive: true, force: true });
}
