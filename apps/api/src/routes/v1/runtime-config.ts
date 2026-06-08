import { Hono } from "hono";
import { runtimeConfigUpdateSchema } from "@feedmind/contracts";
import { HttpError, jsonOk, parseJson } from "../../lib/http.js";
import { getAllConfigs, updateConfig } from "../../modules/models/config-service.js";

export const runtimeConfigRoutes = new Hono();

runtimeConfigRoutes.get("/runtime-configs", async (c) => jsonOk(c, await getAllConfigs()));

runtimeConfigRoutes.put("/runtime-configs/:scenario", async (c) => {
  const scenario = c.req.param("scenario");
  if (scenario !== "session" && scenario !== "wiki") {
    throw new HttpError(422, "VALIDATION_ERROR", "scenario must be 'session' or 'wiki'");
  }
  const payload = await parseJson(c, runtimeConfigUpdateSchema);
  return jsonOk(c, await updateConfig(scenario, payload));
});
