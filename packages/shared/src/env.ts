// Bun 自动加载 .env 文件，无需 dotenv 库
// 见 https://bun.com/docs/runtime/environment-variables

export function isProduction(appEnv: string): boolean {
  return ["prod", "production"].includes(appEnv.trim().toLowerCase());
}
