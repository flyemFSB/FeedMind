import { Hono } from "hono";
import { z } from "zod";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
} from "../../modules/chats/service.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";

export const chatRoutes = new Hono();

const createSessionSchema = z.object({
  agent_thread_id: z.string().optional(),
  title: z.string().nullable().optional(),
});

chatRoutes.post("/chats", async (c) => {
  const payload = await parseJson(c, createSessionSchema);
  return jsonOk(c, await createChatSession(payload.agent_thread_id, payload.title), 201);
});

chatRoutes.get("/chats", async (c) => jsonOk(c, await listChatSessions()));
chatRoutes.get("/chats/:sessionId", async (c) =>
  jsonOk(c, await getChatSession(c.req.param("sessionId"))),
);

/** 从 Memory 读取会话消息 */
chatRoutes.get("/chats/:sessionId/messages", async (c) => {
  const threadId = c.req.param("sessionId");
  const memory = await feedmindAgent.getMemory();
  if (!memory) return jsonOk(c, []);
  const { messages } = await memory.recall({ threadId, perPage: false });
  return jsonOk(c, toAISdkV5Messages(messages));
});

chatRoutes.delete("/chats/:sessionId", async (c) =>
  jsonOk(c, await deleteChatSession(c.req.param("sessionId"))),
);
