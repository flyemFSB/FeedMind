import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError, jsonError, jsonOk, parseJson } from "./http.js";

// 信封协议是前后端契约（ApiEnvelope），结构变动会破坏所有前端错误提示，必须锁定。
// parseJson 抛出的 HttpError 由全局 onError 转换（与 app.ts 一致），否则 Hono 默认回 500
function makeApp(): Hono {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof HttpError)
      return jsonError(
        c,
        error.status,
        error.code,
        error.message,
        error.details,
        error.i18nKey ? { key: error.i18nKey, params: error.i18nParams } : undefined,
      );
    return jsonError(c, 500, "INTERNAL_SERVER_ERROR", "操作未完成，请重试");
  });
  return app;
}

function route(c: Hono): Hono {
  c.get("/ok", (ctx) => jsonOk(ctx, { id: 1 }));
  c.get("/err", (ctx) =>
    jsonError(
      ctx,
      401,
      "COOKIE_EXPIRED",
      "Cookie 已失效",
      { platform: "weread" },
      {
        key: "apiError.crawlerCookieExpired",
        params: { platform: "weread" },
      },
    ),
  );
  c.get("/plain", (ctx) => jsonError(ctx, 500, "E", "m"));
  c.post("/parse", async (ctx) => {
    const data = await parseJson(ctx, z.object({ name: z.string() }));
    return ctx.json(data);
  });
  return c;
}

describe("jsonOk / jsonError 信封结构", () => {
  it("jsonOk 输出 { data, error: null }", async () => {
    const res = await route(makeApp()).request("/ok");
    expect(await res.json()).toEqual({ data: { id: 1 }, error: null });
  });

  it("jsonError 输出 { data: null, error: { code, message, details } } 与 i18n 锚点", async () => {
    const res = await route(makeApp()).request("/err");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      data: null,
      error: {
        code: "COOKIE_EXPIRED",
        message: "Cookie 已失效",
        details: { platform: "weread" },
        i18n: { key: "apiError.crawlerCookieExpired", params: { platform: "weread" } },
      },
    });
  });

  it("HttpError 无 i18n 锚点时 i18n 字段不出现", async () => {
    const res = await route(makeApp()).request("/plain");
    const body = (await res.json()) as { error: Record<string, unknown> };
    expect(body.error).not.toHaveProperty("i18n");
  });
});

describe("parseJson", () => {
  it("非法 JSON 抛 400 BAD_REQUEST", async () => {
    const res = await route(makeApp()).request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("校验失败抛 422 并指明首个字段", async () => {
    const res = await route(makeApp()).request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 42 }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; message: string; i18n?: { params?: { field?: string } } };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("name");
    expect(body.error.i18n?.params?.field).toBe("name");
  });

  it("合法请求体透传解析结果", async () => {
    const res = await route(makeApp()).request("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "日报" }),
    });
    expect(await res.json()).toEqual({ name: "日报" });
  });
});
