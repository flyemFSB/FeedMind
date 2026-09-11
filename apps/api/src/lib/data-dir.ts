import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@feedmind/db";

/**
 * 解析运行时数据目录（数据库、向量库、wiki 等落盘位置）。
 * 优先环境变量 DATA_DIR（desktop 注入 userData、测试与容器显式指定）。
 * 未设置时锚定仓库根而非 process.cwd()。
 */
export function resolveDataDir(): string {
  const dir = process.env["DATA_DIR"] ?? join(findRepoRoot(import.meta.dirname), "data");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // 目录存在或只读环境按需忽略
  }
  return dir;
}
