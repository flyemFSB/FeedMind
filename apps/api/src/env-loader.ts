/**
 * 环境变量加载器 — 必须作为 server.ts 的第一个 import。
 * 利用 ESM 模块初始化顺序，确保 .env 在其他模块读取 process.env 前加载完成。
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, "..", "..", "..");

config({ path: resolve(projectRoot, ".env") });
