import { z } from "zod";

export const chatMessageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export const chatMessageStatusSchema = z.enum(["streaming", "completed", "failed"]);

export const chatMessageSnapshotSchema = z.object({
  agent_message_id: z.string().min(1),
  role: chatMessageRoleSchema,
  content: z.string().min(1),
  status: chatMessageStatusSchema.default("completed"),
  model: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const chatSessionSnapshotSchema = z.object({
  title: z.string().nullable().optional(),
  messages: z.array(chatMessageSnapshotSchema).default([]),
});

export const chatSessionReadSchema = z.object({
  id: z.string(),
  agent_thread_id: z.string(),
  title: z.string(),
  message_count: z.number().int().nonnegative(),
  last_message_at: z.string().nullable(),
});

export const chatSessionListItemSchema = chatSessionReadSchema.extend({
  pinned: z.boolean(),
  updated_at: z.string(),
});

export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;
export type ChatMessageSnapshot = z.infer<typeof chatMessageSnapshotSchema>;
export type ChatSessionSnapshot = z.infer<typeof chatSessionSnapshotSchema>;
export type ChatSessionRead = z.infer<typeof chatSessionReadSchema>;
export type ChatSessionListItem = z.infer<typeof chatSessionListItemSchema>;
