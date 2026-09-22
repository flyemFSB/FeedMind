import { mkdirSync } from "node:fs";

/** 解析运行时数据目录，严格依赖 DATA_DIR 避免打包后路径失效 */
export function resolveDataDir(): string {
  const dir = process.env["DATA_DIR"]?.trim();
  if (!dir) {
    throw new Error("DATA_DIR 未设置：桌面端由主进程注入，独立运行请在 .env 中配置 DATA_DIR");
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // 目录存在或只读环境按需忽略
  }
  return dir;
}
