import { z } from "zod";

export const chatSessionReadSchema = z.object({
  id: z.string(),
  agent_thread_id: z.string(),
  title: z.string(),
});

export const chatSessionListItemSchema = chatSessionReadSchema.extend({
  pinned: z.boolean(),
  updated_at: z.string(),
});

export type ChatSessionRead = z.infer<typeof chatSessionReadSchema>;
export type ChatSessionListItem = z.infer<typeof chatSessionListItemSchema>;
