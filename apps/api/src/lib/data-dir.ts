import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 解析运行时数据目录（数据库、向量库、wiki 等落盘位置）。
 * 优先环境变量 DATA_DIR；未设置时退回 process.cwd()/data。
 */
export function resolveDataDir(): string {
  const dir = process.env["DATA_DIR"] ?? resolve(process.cwd(), "data");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // 目录存在或只读环境按需忽略
  }
  return dir;
}
