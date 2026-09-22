/** 环境判定与日志级别解析工具，供各包统一复用 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** 生产环境判定：APP_ENV 语义的唯一约定 */
export function isProductionEnv(appEnv: string | undefined): boolean {
  return ["prod", "production"].includes((appEnv ?? "").trim().toLowerCase());
}

/** 日志级别单一真源：显式 LOG_LEVEL 优先，否则按环境给默认（开发 debug / 生产 info） */
export function resolveLogLevel(
  source: Record<string, string | undefined> = process.env,
): LogLevel {
  const explicit = source["LOG_LEVEL"]?.trim();
  // 非法值由 apiEnv 的 z.enum 在启动期拦下，此处按未设置处理，不在库层重复校验
  if (explicit && (LOG_LEVELS as readonly string[]).includes(explicit)) return explicit as LogLevel;
  return isProductionEnv(source["APP_ENV"]) ? "info" : "debug";
}
