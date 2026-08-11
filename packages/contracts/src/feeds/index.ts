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

// 批量删除入参：前端一次仅能选到已加载条目（上限 100），此处不做数量硬限，
// 但最小为 1 避免空请求
export const feedDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});
export type FeedDelete = z.infer<typeof feedDeleteSchema>;

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
