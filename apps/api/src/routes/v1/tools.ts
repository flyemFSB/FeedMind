import { Hono } from "hono";
import { z } from "zod";
import { toolConfigUpdateSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  listTools,
  listToolsRuntime,
  getToolRuntime,
  updateToolConfig,
} from "../../modules/tools/service.js";
import { ToolConfigClient } from "../../mastra/tools/search/config.js";

export const toolsRoutes = new Hono();

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
  // 清除工具配置缓存，确保下次 Agent 调用能拿到最新配置
  ToolConfigClient.getInstance().clearCache();
  return jsonOk(c, results);
});
