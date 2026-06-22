import { Hono } from "hono";
import { remoteConnectionUpsertSchema } from "@feedmind/contracts";
import { jsonOk, jsonError, parseJson } from "../../lib/http.js";
import {
  listConnections,
  getConnection,
  upsertConnection,
  deleteConnection,
} from "../../modules/remote-connection/service.js";
import { getFeishuConfig, saveAndVerify } from "../../modules/remote-connection/feishu-service.js";

export const remoteConnectionRoutes = new Hono();

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
  return jsonOk(c, data);
});

remoteConnectionRoutes.delete("/remote-connections/:id", async (c) => {
  await deleteConnection(c.req.param("id"));
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
remoteConnectionRoutes.post("/remote-connections/feishu/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.appId || !body.appSecret) {
    return jsonError(c, 400, "MISSING_FIELDS", "App ID 和 App Secret 不能为空");
  }
  try {
    await saveAndVerify({ appId: body.appId, appSecret: body.appSecret });
    return jsonOk(c, { success: true });
  } catch (err: any) {
    return jsonError(c, 400, "VERIFY_FAILED", err.message ?? "凭证验证失败");
  }
});
