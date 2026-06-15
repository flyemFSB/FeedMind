import { z } from "zod";

export const llmModelCreateSchema = z.object({
  provider: z.string().min(1).max(64),
  model_name: z.string().min(1).max(128),
  model_id: z.string().max(256).default(""),
  base_url: z.string().max(512).default(""),
  api_key: z.string().max(2048).default(""),
  context_window: z.string().nullable().optional(),
  max_output: z.string().nullable().optional(),
});

export const llmModelUpdateSchema = llmModelCreateSchema;

export const llmModelReadSchema = llmModelCreateSchema.omit({ api_key: true }).extend({
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

export const llmModelRuntimeReadSchema = z.object({
  model_name: z.string(),
  model_id: z.string().nullable(),
  base_url: z.string(),
  api_key: z.string(),
  context_window: z.string().nullable(),
  max_output: z.string().nullable(),
});

export type LLMModelCreate = z.infer<typeof llmModelCreateSchema>;
export type LLMModelUpdate = z.infer<typeof llmModelUpdateSchema>;
export type LLMModelRead = z.infer<typeof llmModelReadSchema>;
export type SelectedModelUpdate = z.infer<typeof selectedModelUpdateSchema>;
export type SelectedModelRead = z.infer<typeof selectedModelReadSchema>;
export type LLMModelRuntimeRead = z.infer<typeof llmModelRuntimeReadSchema>;
