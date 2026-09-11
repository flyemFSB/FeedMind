import { z } from "zod";

export const skillReadSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  version: z.string().optional(),
  author: z.string().optional(),
  installed_at: z.string(),
  size: z.number().int(),
});

export const skillListSchema = z.object({
  items: z.array(skillReadSchema),
});

export type SkillRead = z.infer<typeof skillReadSchema>;
