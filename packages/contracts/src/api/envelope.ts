import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  // 可选 i18n 翻译信息：词条（zh/en 双语）在前端资源，按 key + 参数翻译；
  // message 仅作词条缺失时的兜底，不直接作为界面文案
  i18n: z
    .object({
      key: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiEnvelope<T> = {
  data: T | null;
  error?: ApiError | null;
};
