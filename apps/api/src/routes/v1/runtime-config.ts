import { OpenAPIHono } from "@hono/zod-openapi";
import { runtimeConfigUpdateSchema } from "@feedmind/contracts";
import { HttpError, jsonOk, parseJson } from "../../lib/http.js";
import { getAllConfigs, updateConfig } from "../../modules/runtime-config/config-service.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const runtimeConfigRoutes = new OpenAPIHono();

runtimeConfigRoutes.get("/runtime-configs", async (c) => jsonOk(c, await getAllConfigs()));

runtimeConfigRoutes.put("/runtime-configs/:runtime", async (c) => {
  const runtime = c.req.param("runtime");
  if (runtime !== "session" && runtime !== "wiki") {
    throw new HttpError(422, "VALIDATION_ERROR", "运行类型只能是 session 或 wiki");
  }
  const payload = await parseJson(c, runtimeConfigUpdateSchema);
  const result = await updateConfig(runtime, payload);
  // detail 只记改了哪些键，不落值（含密钥类字段）
  const changed = Object.keys(payload);
  void logOperation({
    action: "update",
    target: "runtime_config",
    targetName: runtime === "wiki" ? "Wiki 运行配置" : "对话运行配置",
    detail: changed.join(", "),
  });
  return jsonOk(c, result);
});
