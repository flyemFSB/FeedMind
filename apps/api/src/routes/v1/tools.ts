import { Hono } from "hono";
import { z } from "zod";
import { toolConfigUpdateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import { listTools, updateToolConfig } from "../../modules/tools/service.js";

export const toolsRoutes = new Hono();

toolsRoutes.get("/tools", async (c) => jsonOk(c, await listTools()));

// /tools/runtime 仅返回运行时状态，不暴露 API Key（密码字段已掩码）
toolsRoutes.get("/tools/runtime", async (c) => jsonOk(c, await listTools()));

const batchUpdateSchema = z.record(z.string(), toolConfigUpdateSchema);

toolsRoutes.put("/tools", async (c) => {
  const body = await parseJson(c, batchUpdateSchema);
  const results = await Promise.all(
    Object.entries(body).map(([name, payload]) => updateToolConfig(name, payload)),
  );
  return jsonOk(c, results);
});
