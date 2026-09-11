import { z } from "@hono/zod-openapi";

/**
 * 错误信封 schema：与 lib/http.ts 的 jsonError 产出同构（code/message/details/i18n）。
 * 所有 createRoute 的 4xx/5xx 响应复用它，避免每个路由文件重复声明同一段。
 */
export const apiErrorSchema = z.object({
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    // i18n 锚点 + 参数：与 contracts 信封保持同一结构，openapi 文档类型与实现一致
    i18n: z
      .object({
        key: z.string(),
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      })
      .optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** 成功信封 { data, error: null }，data 由调用方传入 schema */
export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, error: z.null() });

/** 统一的错误响应描述块，供 createRoute 的 responses 展开 */
export const errorResponse = (description: string) => ({
  content: { "application/json": { schema: apiErrorSchema } },
  description,
});
