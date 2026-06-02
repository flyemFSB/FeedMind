import { Hono } from "hono";
import { z } from "zod";
import { toolConfigUpdateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import { listTools, listToolsRuntime, updateToolConfig } from "../../modules/tools/service.js";

export const toolsRoutes = new Hono();

toolsRoutes.get("/tools", async (c) => jsonOk(c, await listTools()));

toolsRoutes.get("/tools/runtime", async (c) => jsonOk(c, await listToolsRuntime()));

const batchUpdateSchema = z.record(z.string(), toolConfigUpdateSchema);

toolsRoutes.put("/tools", async (c) => {
  const body = await parseJson(c, batchUpdateSchema);
  const results = await Promise.all(
    Object.entries(body).map(([name, payload]) => updateToolConfig(name, payload)),
  );
  return jsonOk(c, results);
});
