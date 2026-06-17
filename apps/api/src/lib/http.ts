import type { Context } from "hono";
import type { ZodType } from "zod";
import type { ApiEnvelope } from "@feedmind/contracts";

// 可被 app.onError 捕获的业务异常，携带状态码和错误码
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// 统一成功响应包装为 { data, error: null } 信封格式
export function jsonOk<T>(c: Context, data: T, status = 200): Response {
  return c.json<ApiEnvelope<T>>({ data, error: null }, status as 200);
}

// 统一错误响应包装
export function jsonError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  return c.json<ApiEnvelope<never>>(
    { data: null, error: { code, message, details } },
    status as 400,
  );
}

// 读取请求体并用 Zod schema 校验，失败抛出 HttpError 交由全局处理器
export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const payload = await c.req.json().catch(() => {
    throw new HttpError(400, "BAD_REQUEST", "请求体不是有效 JSON");
  });
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "请求参数校验失败", {
      errors: result.error.issues,
    });
  }
  return result.data;
}
