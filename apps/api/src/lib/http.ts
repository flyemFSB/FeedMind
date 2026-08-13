import type { Context } from "hono";
import type { ZodType } from "zod";
import type { ApiEnvelope } from "@feedmind/contracts";

// 可被 app.onError 捕获的业务异常，携带状态码和错误码
// i18nKey/i18nParams：翻译锚点。词条（zh/en）在前端 i18n 资源（apiError.*），
// message 仅作词条缺失/无锚点时的兜底，不直接作为界面文案（Stripe 模式）
export class HttpError extends Error {
  public readonly i18nKey: string | undefined;
  public readonly i18nParams: Record<string, string | number> | undefined;

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    // options：内部错误原因只进日志（onError 提取 cause），不随 details 序列化到响应
    options?: { cause?: unknown; i18nKey?: string; i18nParams?: Record<string, string | number> },
  ) {
    super(message, options);
    this.i18nKey = options?.i18nKey;
    this.i18nParams = options?.i18nParams;
  }
}

// 统一成功响应包装为 { data, error: null } 信封格式
export function jsonOk<T>(c: Context, data: T, status = 200): Response {
  return c.json<ApiEnvelope<T>>({ data, error: null }, status as 200);
}

export function jsonError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  i18n?: { key: string; params?: Record<string, string | number> | undefined },
): Response {
  return c.json<ApiEnvelope<never>>(
    { data: null, error: { code, message, details, ...(i18n ? { i18n } : {}) } },
    status as 400,
  );
}

// 读取请求体并用 Zod schema 校验，失败抛出 HttpError 交由全局处理器
export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const payload = await c.req.json().catch(() => {
    throw new HttpError(400, "BAD_REQUEST", "请求数据格式不正确");
  });
  const result = schema.safeParse(payload);
  if (!result.success) {
    // 指明首个校验失败的字段，避免「请求参数校验失败」这类用户无法定位的模糊提示
    const field = result.error.issues[0]?.path.join(".");
    throw new HttpError(
      422,
      "VALIDATION_ERROR",
      field ? `请求参数校验失败：${field}` : "请求参数校验失败",
      { errors: result.error.issues },
      {
        i18nKey: "apiError.validationFailed",
        ...(field ? { i18nParams: { field } } : {}),
      },
    );
  }
  return result.data;
}
