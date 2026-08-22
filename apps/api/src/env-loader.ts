import { resolve } from "node:path";
import { config } from "dotenv";

// 必须作为第一个 import，确保 .env 在其他模块读取 process.env 前加载完成
config({ path: resolve(import.meta.dirname, "../../../.env") });
