import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { remoteConnectionUpsertSchema } from "@feedmind/contracts";
import { jsonOk, jsonError, parseJson, HttpError } from "../../lib/http.js";
import { successEnvelope, errorResponse } from "../../lib/openapi-schemas.js";
import {
  listConnections,
  getConnection,
  upsertConnection,
  deleteConnection,
} from "../../modules/remote-connection/service.js";
import { getFeishuConfig, saveAndVerify } from "../../modules/remote-connection/feishu-service.js";
import {
  beginRegistration,
  pollRegistration,
} from "../../modules/remote-connection/feishu-registration.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const remoteConnectionRoutes = new OpenAPIHono();

// ─── 列表 ─────────────────────────────────────────────────────
remoteConnectionRoutes.get("/remote-connections", async (c) => {
  const platform = c.req.query("platform");
  const data = await listConnections(platform);
  return jsonOk(c, data);
});

remoteConnectionRoutes.get("/remote-connections/:id", async (c) => {
  const data = await getConnection(c.req.param("id"));
  return jsonOk(c, data);
});

remoteConnectionRoutes.post("/remote-connections", async (c) => {
  const payload = await parseJson(c, remoteConnectionUpsertSchema);
  const data = await upsertConnection(payload.platform, payload);
  void logOperation({
    action: "update",
    target: "remote_connection",
    targetName: data.label,
  });
  return jsonOk(c, data);
});

remoteConnectionRoutes.delete("/remote-connections/:id", async (c) => {
  const id = c.req.param("id");
  const conn = await getConnection(id).catch(() => null);
  await deleteConnection(id);
  void logOperation({
    action: "delete",
    target: "remote_connection",
    targetName: conn?.label ?? id,
  });
  return c.body(null, 204);
});

// ─── 飞书: 状态检查 ─────────────────────────────────────────
remoteConnectionRoutes.get("/remote-connections/feishu/status", async (c) => {
  const cfg = await getFeishuConfig();
  return jsonOk(c, {
    configured: !!cfg,
    connected: !!cfg,
    config: cfg ? { appId: cfg.appId } : null,
  });
});

// ─── 飞书: 保存配置 + 验证 ─────────────────────────────────
const feishuConfigUpsertSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
});

remoteConnectionRoutes.post("/remote-connections/feishu/config", async (c) => {
  const { appId, appSecret } = await parseJson(c, feishuConfigUpsertSchema);
  try {
    await saveAndVerify({ appId, appSecret });
    return jsonOk(c, { success: true });
  } catch (err) {
    return jsonError(c, 400, "VERIFY_FAILED", err instanceof Error ? err.message : "凭证验证失败");
  }
});

// ─── 飞书: 扫码注册（一键创建应用） ─────────────────────────
// 与上面的 status/config 同属一个资源，故同文件；响应走 { data, error } 信封

const registerBeginDataSchema = z.object({
  deviceCode: z.string().describe("注册会话设备码"),
  qrUrl: z.string().describe("扫码授权二维码链接"),
  interval: z.number().describe("轮询间隔（秒）"),
  expireIn: z.number().describe("二维码有效期（秒）"),
});

const registerPollDataSchema = z.object({
  status: z.enum(["pending", "success", "error"]),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  error: z.string().optional(),
});

const registerBeginRoute = createRoute({
  method: "post",
  path: "/remote-connections/feishu/register/begin",
  responses: {
    200: {
      content: { "application/json": { schema: successEnvelope(registerBeginDataSchema) } },
      description: "创建飞书扫码注册会话，返回二维码链接",
    },
    502: errorResponse("注册会话创建失败"),
  },
});

remoteConnectionRoutes.openapi(registerBeginRoute, async (c) => {
  try {
    return c.json({ data: await beginRegistration(), error: null }, 200);
  } catch (err) {
    // HttpError 已带用户可读消息与 i18n 锚点（网络失败/授权失败），原样透传
    const e = err instanceof HttpError ? err : null;
    // beginRegistration 只抛 502（网络失败/授权失败），断言收窄到 schema 声明的 502
    const status = (e?.status ?? 502) as 502;
    return c.json(
      {
        data: null,
        error: {
          code: e?.code ?? "REGISTER_BEGIN_FAILED",
          message: e?.message ?? (err instanceof Error ? err.message : "创建注册会话失败"),
          details: e?.details ?? {},
          ...(e?.i18nKey
            ? { i18n: { key: e.i18nKey, ...(e.i18nParams ? { params: e.i18nParams } : {}) } }
            : {}),
        },
      },
      status,
    );
  }
});

const registerPollRoute = createRoute({
  method: "post",
  path: "/remote-connections/feishu/register/poll",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ deviceCode: z.string().describe("注册会话设备码") }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: successEnvelope(registerPollDataSchema) } },
      description: "轮询扫码授权结果",
    },
    502: errorResponse("轮询注册状态失败"),
  },
});

remoteConnectionRoutes.openapi(registerPollRoute, async (c) => {
  try {
    const { deviceCode } = c.req.valid("json");
    return c.json({ data: await pollRegistration(deviceCode), error: null }, 200);
  } catch (err) {
    return c.json(
      {
        data: null,
        error: {
          code: "REGISTER_POLL_FAILED",
          message: err instanceof Error ? err.message : "轮询注册状态失败",
        },
      },
      502,
    );
  }
});
