import { z } from "zod";

export const runtimeConfigReadSchema = z.object({
  scenario: z.string(),
  llm_id: z.number().int().positive().nullable(),
  model_name: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number(),
  max_tokens: z.number().int(),
  context_length: z.string(),
  system_prompt: z.string(),
});

export const runtimeConfigUpdateSchema = z.object({
  llm_id: z.number().int().positive().nullable().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().optional(),
  context_length: z.string().optional(),
  system_prompt: z.string().optional(),
});

export type RuntimeConfigRead = z.infer<typeof runtimeConfigReadSchema>;
export type RuntimeConfigUpdate = z.infer<typeof runtimeConfigUpdateSchema>;
