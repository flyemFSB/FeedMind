import { z } from "zod";

export const modelCreateSchema = z.object({
  type: z.enum(["chat", "embedding", "ocr"]).default("chat"),
  provider: z.string().min(1).max(64),
  model_name: z.string().min(1).max(128),
  model_id: z.string().max(256).default(""),
  base_url: z.string().max(512).default(""),
  api_key: z.string().max(2048).default(""),
  context_window: z.number().int().positive().nullable().optional(),
  max_output: z.number().int().positive().nullable().optional(),
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

export type ModelCreate = z.infer<typeof modelCreateSchema>;
export type ModelUpdate = z.infer<typeof modelUpdateSchema>;
export type ModelRead = z.infer<typeof modelReadSchema>;
export type SelectedModelUpdate = z.infer<typeof selectedModelUpdateSchema>;
export type SelectedModelRead = { id: number | null };
export type ModelRuntimeRead = {
  provider: string;
  model_name: string;
  model_id: string | null;
  base_url: string;
  api_key: string;
  context_window: number | null;
  max_output: number | null;
};
