import { Hono } from "hono";
import { runtimeConfigUpdateSchema } from "@feedmind/contracts";
import { HttpError, jsonOk, parseJson } from "../../lib/http.js";
import { getAllConfigs, updateConfig } from "../../modules/models/config-service.js";

export const runtimeConfigRoutes = new Hono();

runtimeConfigRoutes.get("/runtime-configs", async (c) => jsonOk(c, await getAllConfigs()));

runtimeConfigRoutes.put("/runtime-configs/:runtime", async (c) => {
  const runtime = c.req.param("runtime");
  if (runtime !== "session" && runtime !== "wiki") {
    throw new HttpError(422, "VALIDATION_ERROR", "运行类型只能是 session 或 wiki");
  }
  const payload = await parseJson(c, runtimeConfigUpdateSchema);
  return jsonOk(c, await updateConfig(runtime, payload));
});
