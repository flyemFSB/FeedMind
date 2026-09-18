import { z } from "zod";

export const chatSessionListItemSchema = z.object({
  id: z.string(),
  agent_thread_id: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  updated_at: z.string(),
});

export type ChatSessionRead = {
  id: string;
  agent_thread_id: string;
  title: string;
};
export type ChatSessionListItem = z.infer<typeof chatSessionListItemSchema>;
