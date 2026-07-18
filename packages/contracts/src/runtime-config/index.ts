import { z } from "zod";

export const runtimeConfigReadSchema = z.object({
  runtime: z.string(),
  llm_id: z.number().int().positive().nullable(),
  model_name: z.string().optional(),
  model_id: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number(),
  top_p: z.number(),
  system_prompt: z.string(),
});

export const runtimeConfigUpdateSchema = z.object({
  llm_id: z.number().int().positive().nullable().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  system_prompt: z.string().optional(),
});

export type RuntimeConfigRead = z.infer<typeof runtimeConfigReadSchema>;
export type RuntimeConfigUpdate = z.infer<typeof runtimeConfigUpdateSchema>;
