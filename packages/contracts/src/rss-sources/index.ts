import { z } from "zod";

export const rssSourceTypeSchema = z.enum(["rss", "social"]);

export const rssSourceCreateSchema = z.object({
  type: rssSourceTypeSchema,
  platform: z.string().optional(),
  route: z.string().optional(),
  url: z.string(),
  title: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type RssSourceCreate = z.infer<typeof rssSourceCreateSchema>;

export const rssSourceUpdateSchema = z.object({
  title: z.string().optional(),
});
export type RssSourceUpdate = z.infer<typeof rssSourceUpdateSchema>;

export const rssSourceSchema = z.object({
  id: z.string(),
  type: rssSourceTypeSchema,
  platform: z.string().nullable(),
  route: z.string().nullable(),
  url: z.string(),
  title: z.string(),
  params: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RssSource = z.infer<typeof rssSourceSchema>;
