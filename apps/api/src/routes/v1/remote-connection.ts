import { Hono } from "hono";
import { z } from "zod";
import { remoteConnectionUpsertSchema } from "@feedmind/contracts";
import { jsonOk, jsonError, parseJson } from "../../lib/http.js";
import {
  listConnections,
  getConnection,
  upsertConnection,
  deleteConnection,
} from "../../modules/remote-connection/service.js";
import { getFeishuConfig, saveAndVerify } from "../../modules/remote-connection/feishu-service.js";
import { logOperation } from "../../modules/ops-log/service.js";

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
