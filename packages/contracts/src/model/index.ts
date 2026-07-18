import { z } from "zod";

export const modelCreateSchema = z.object({
  type: z.enum(["chat", "embedding"]).default("chat"),
  provider: z.string().min(1).max(64),
  model_name: z.string().min(1).max(128),
  model_id: z.string().max(256).default(""),
  base_url: z.string().max(512).default(""),
  api_key: z.string().max(2048).default(""),
  context_window: z.string().nullable().optional(),
  max_output: z.string().nullable().optional(),
});

export const modelUpdateSchema = modelCreateSchema.partial();

export const modelReadSchema = modelCreateSchema.omit({ api_key: true }).extend({
  id: z.number().int().positive(),
  has_api_key: z.boolean(),
  is_selected: z.boolean().default(false),
});

export const selectedModelUpdateSchema = z.object({
  id: z.number().int().positive(),
});

export const selectedModelReadSchema = z.object({
  id: z.number().int().positive().nullable(),
});

export const modelRuntimeReadSchema = z.object({
  model_name: z.string(),
  model_id: z.string().nullable(),
  base_url: z.string(),
  api_key: z.string(),
  context_window: z.string().nullable(),
  max_output: z.string().nullable(),
});

export type ModelCreate = z.infer<typeof modelCreateSchema>;
export type ModelUpdate = z.infer<typeof modelUpdateSchema>;
export type ModelRead = z.infer<typeof modelReadSchema>;
export type SelectedModelUpdate = z.infer<typeof selectedModelUpdateSchema>;
export type SelectedModelRead = z.infer<typeof selectedModelReadSchema>;
export type ModelRuntimeRead = z.infer<typeof modelRuntimeReadSchema>;
