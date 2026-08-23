import { resolve } from "node:path";

// 必须作为第一个 import，确保 .env 在其他模块读取 process.env 前加载完成
try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
} catch {
  // .env 文件可选，允许直接使用系统环境变量
}
