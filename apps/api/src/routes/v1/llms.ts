import { Hono } from "hono";
import {
  llmModelCreateSchema,
  llmModelUpdateSchema,
  selectedModelUpdateSchema,
} from "@feedmind/contracts";
import { HttpError, jsonOk, parseJson } from "../../lib/http.js";
import {
  createModel,
  deleteModel,
  getModelRuntime,
  getSelectedModel,
  listModels,
  setSelectedModel,
  updateModel,
} from "../../modules/llms/service.js";

export const llmRoutes = new Hono();

// 路径参数 modelId 校验，防止非数值或零值注入 SQL
function parseModelId(value: string): number {
  const modelId = Number(value);
  if (!Number.isInteger(modelId) || modelId <= 0) {
    throw new HttpError(422, "VALIDATION_ERROR", "model id must be a positive integer");
  }
  return modelId;
}

llmRoutes.get("/llms", async (c) => jsonOk(c, await listModels()));

llmRoutes.post("/llms", async (c) => {
  const payload = await parseJson(c, llmModelCreateSchema);
  return jsonOk(c, await createModel(payload), 201);
});

llmRoutes.put("/llms/selected", async (c) => {
  const payload = await parseJson(c, selectedModelUpdateSchema);
  return jsonOk(c, await setSelectedModel(payload));
});

llmRoutes.get("/llms/selected", async (c) => jsonOk(c, await getSelectedModel()));

llmRoutes.get("/llms/:modelId/runtime", async (c) => {
  // 仅限内部 Agent 调用，通过 x-feedmind-internal 头标识
  const isInternal = c.req.header("x-feedmind-internal") === "1";
  if (!isInternal) {
    throw new HttpError(403, "FORBIDDEN", "runtime 端点仅限内部调用");
  }
  return jsonOk(c, await getModelRuntime(parseModelId(c.req.param("modelId"))));
});

llmRoutes.put("/llms/:modelId", async (c) => {
  const payload = await parseJson(c, llmModelUpdateSchema);
  return jsonOk(c, await updateModel(parseModelId(c.req.param("modelId")), payload));
});

llmRoutes.delete("/llms/:modelId", async (c) =>
  jsonOk(c, await deleteModel(parseModelId(c.req.param("modelId")))),
);
