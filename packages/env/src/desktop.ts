import { z } from "zod";

/** 空串按未设置处理：.env 中 KEY=（空串）不应覆盖默认值 */
function withoutEmptyStrings(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
}

/** 桌面端运行时环境变量：全部带硬编码默认值，非法值直接启动失败而非静默回退 */
export const desktopEnvSchema = z.object({
  /** 内置 API 服务监听端口 */
  API_PORT: z.coerce.number().int().min(1).max(65535).default(18790),
  /** 内置 Chromium 的 CDP 调试端口：0 表示由系统自动分配，避免默认端口被他人占用 */
  CDP_PORT: z.coerce.number().int().min(0).max(65535).default(0),
});
export type DesktopEnv = z.infer<typeof desktopEnvSchema>;

export function parseDesktopEnv(
  source: Record<string, string | undefined> = process.env,
): DesktopEnv {
  const result = desktopEnvSchema.safeParse(withoutEmptyStrings(source));
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`桌面端环境变量非法：${detail}`);
  }
  return result.data;
}
