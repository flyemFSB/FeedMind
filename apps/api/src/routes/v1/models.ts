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
  return jsonOk(c, await createModel(payload), 201);
});

modelRoutes.put("/models/selected", async (c) => {
  const payload = await parseJson(c, selectedModelUpdateSchema);
  const type = c.req.query("type") ?? "chat";
  return jsonOk(c, await setSelectedModel(payload, type));
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
  return jsonOk(c, await updateModel(parseModelId(c.req.param("modelId")), payload));
});

modelRoutes.delete("/models/:modelId", async (c) =>
  jsonOk(c, await deleteModel(parseModelId(c.req.param("modelId")))),
);
