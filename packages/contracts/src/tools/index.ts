import { z } from "zod";

export const configFieldSchema = z.object({
  key: z.string(),
  type: z.enum(["text", "password", "number", "boolean", "select"]),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  link: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  defaultValue: z.unknown().optional(),
});

export type ConfigField = z.infer<typeof configFieldSchema>;

export const toolReadSchema = z.object({
  name: z.string(),
  category: z.string(),
  display_name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  config_fields: z.array(configFieldSchema),
  config: z.record(z.string(), z.unknown()),
  password_set: z.record(z.string(), z.boolean()).default({}),
  is_enabled: z.boolean(),
  sort_order: z.number(),
});

export type ToolRead = z.infer<typeof toolReadSchema>;

export const toolConfigUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  is_enabled: z.boolean().optional(),
});

export type ToolConfigUpdate = z.infer<typeof toolConfigUpdateSchema>;
