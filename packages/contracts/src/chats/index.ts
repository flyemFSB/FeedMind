import { z } from "zod";

/** 记忆归属标识：本地单用户工作台，所有会话共享一个 resource，观察记忆才能跨会话召回 */
export const LOCAL_RESOURCE_ID = "local-user";

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
  metadata?: Record<string, unknown> | undefined;
};
export type ChatSessionListItem = z.infer<typeof chatSessionListItemSchema>;
