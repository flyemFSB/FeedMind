import { resolve } from "node:path";

/**
 * 解析运行时数据目录（数据库、向量库、wiki、skills 等落盘位置）。
 * 优先环境变量 DATA_DIR；未设置时退回 import.meta.url 相对推算（dev/standalone 用）。
 * 打包后 import.meta.url 指向只读 asar，desktop 主进程会注入 DATA_DIR 覆盖。
 */
export function resolveDataDir(): string {
  return process.env["DATA_DIR"] ?? resolve(import.meta.dirname, "../../../../data");
}
