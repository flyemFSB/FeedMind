// Node.js 使用 dotenv 加载 .env 文件（server.ts 入口处 import 'dotenv/config'）
// 见 https://github.com/motdotla/dotenv#readme

export function isProduction(appEnv: string): boolean {
  return ["prod", "production"].includes(appEnv.trim().toLowerCase());
}
