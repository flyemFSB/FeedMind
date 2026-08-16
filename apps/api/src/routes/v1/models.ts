import { Hono } from "hono";
import {
  modelCreateSchema,
  modelUpdateSchema,
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
} from "../../modules/models/service.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const modelRoutes = new Hono();

function parseModelId(value: string): number {
  const modelId = Number(value);
  if (!Number.isInteger(modelId) || modelId <= 0) {
    throw new HttpError(422, "VALIDATION_ERROR", "模型 ID 必须是正整数");
  }
  return modelId;
}

modelRoutes.get("/models", async (c) => {
  const type = c.req.query("type");
  return jsonOk(c, await listModels(type));
});

modelRoutes.post("/models", async (c) => {
  const payload = await parseJson(c, modelCreateSchema);
  const model = await createModel(payload);
  void logOperation({ action: "create", target: "model", targetName: model.model_name });
  return jsonOk(c, model, 201);
});

modelRoutes.put("/models/selected", async (c) => {
  const payload = await parseJson(c, selectedModelUpdateSchema);
  const type = c.req.query("type") ?? "chat";
  const prev = await getSelectedModel(type);
  const result = await setSelectedModel(payload, type);
  // 记录切换前后模型 id（名字需再查一次列表，id 已足够定位）
  void logOperation({
    action: "update",
    target: "model",
    targetName: type === "wiki" ? "Wiki 模型" : "对话模型",
    detail: prev.id ? `#${prev.id} → #${payload.id}` : `#${payload.id}`,
  });
  return jsonOk(c, result);
});

modelRoutes.get("/models/selected", async (c) => {
  const type = c.req.query("type") ?? "chat";
  return jsonOk(c, await getSelectedModel(type));
});

modelRoutes.get("/models/:modelId/runtime", async (c) =>
  jsonOk(c, await getModelRuntime(parseModelId(c.req.param("modelId")))),
);

modelRoutes.put("/models/:modelId", async (c) => {
  const payload = await parseJson(c, modelUpdateSchema);
  const model = await updateModel(parseModelId(c.req.param("modelId")), payload);
  void logOperation({ action: "update", target: "model", targetName: model.model_name });
  return jsonOk(c, model);
});

modelRoutes.delete("/models/:modelId", async (c) => {
  const modelId = parseModelId(c.req.param("modelId"));
  // 删除前先取名字供日志展示（deleteModel 只返回 deleted 标记）
  const name = (await listModels()).find((m) => m.id === modelId)?.model_name ?? String(modelId);
  const result = await deleteModel(modelId);
  void logOperation({ action: "delete", target: "model", targetName: name });
  return jsonOk(c, result);
});
