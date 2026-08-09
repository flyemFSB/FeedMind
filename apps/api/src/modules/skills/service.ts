import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { SkillRead } from "@feedmind/contracts";
import { parseFrontmatter } from "@feedmind/wiki-core";
import { resolveDataDir } from "../../lib/data-dir.js";

const execFileAsync = promisify(execFile);

/** skills 目录位于 data/skills/（与 Mastra Workspace 发现路径一致），不再占用 src 源码目录 */
const SKILLS_DIR = path.resolve(resolveDataDir(), "skills");

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
    name: (frontmatter["name"] as string) || "",
    description: (frontmatter["description"] as string) || "",
    ...(frontmatter["version"] !== undefined ? { version: frontmatter["version"] as string } : {}),
    ...(frontmatter["author"] !== undefined ? { author: frontmatter["author"] as string } : {}),
  };
}

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
      // 跳过格式异常的目录
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
  if (!name) throw new Error("技能名称净化后为空。");

  await ensureSkillsDir();
  const targetDir = path.join(SKILLS_DIR, name);

  if (fs.existsSync(targetDir)) {
    throw new Error(`技能 "${name}" 已存在，请先删除再重新安装。`);
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
      throw new Error("解压失败。请确保系统已安装 'unzip' 命令，或添加 'adm-zip' 包。");
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
      throw new Error("无效的技能包：根目录缺少 SKILL.md 文件。");
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

export async function deleteSkill(rawName: string): Promise<void> {
  const name = sanitizeName(rawName);
  if (!name) throw new Error("无效的技能名称。");

  const targetDir = path.resolve(SKILLS_DIR, name);
  if (!isInsideSkillsDir(targetDir)) {
    throw new Error("技能名称不合法。");
  }
  if (!fs.existsSync(targetDir)) {
    throw new Error(`技能 "${name}" 未找到。`);
  }
  await fsp.rm(targetDir, { recursive: true, force: true });
}
