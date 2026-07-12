import { z } from "zod";

export const feedSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  link: z.string().nullable(),
  guid: z.string(),
  author: z.string().nullable(),
  category: z.string().nullable(),
  image: z.string().nullable(),
  pub_date: z.string().nullable(),
  fetched_at: z.string(),
  is_read: z.number(),
  created_at: z.string(),
});
export type Feed = z.infer<typeof feedSchema>;

export const feedBatchSchema = z.object({
  source_id: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      link: z.string().optional(),
      guid: z.string(),
      author: z.string().optional(),
      category: z.array(z.string()).optional(),
      image: z.string().optional(),
      pub_date: z.string().optional(),
    }),
  ),
});
