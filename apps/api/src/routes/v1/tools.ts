import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { toolConfigUpdateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  listTools,
  listToolsRuntime,
  getToolRuntime,
  updateToolConfig,
} from "../../modules/tools/service.js";

export const toolsRoutes = new OpenAPIHono();

toolsRoutes.get("/tools", async (c) => jsonOk(c, await listTools()));

// /tools/runtime 返回运行时状态，密码字段已掩码
toolsRoutes.get("/tools/runtime", async (c) => jsonOk(c, await listToolsRuntime()));

// /tools/:name/runtime 返回单个工具的解密后配置（供前端显示密码真实值）
toolsRoutes.get("/tools/:name/runtime", async (c) => {
  const name = c.req.param("name");
  return jsonOk(c, await getToolRuntime(name));
});

const batchUpdateSchema = z.record(z.string(), toolConfigUpdateSchema);

toolsRoutes.put("/tools", async (c) => {
  const body = await parseJson(c, batchUpdateSchema);
  const results = await Promise.all(
    Object.entries(body).map(([name, payload]) => updateToolConfig(name, payload)),
  );
  // Agent 侧配置缓存由 updateToolConfig 自增版本号失效，路由层无需介入
  return jsonOk(c, results);
});
