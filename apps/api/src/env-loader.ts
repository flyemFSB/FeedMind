import { resolve } from "node:path";

// 必须作为第一个 import，确保 .env 在其他模块读取 process.env 前加载完成
const repoRoot = resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // .env 文件可选，允许直接使用系统环境变量
}

// 独立运行（开发 / 单机部署）时数据目录锚定仓库根：库层只认 DATA_DIR，不自行推导路径
process.env["DATA_DIR"] ??= resolve(repoRoot, "data");
