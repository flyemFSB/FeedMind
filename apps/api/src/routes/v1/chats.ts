import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessionMessages,
  listChatSessions,
  updateChatSessionTitle,
} from "../../modules/chats/service.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const chatRoutes = new OpenAPIHono();

const createSessionSchema = z.object({
  agent_thread_id: z.string().optional(),
  title: z.string().nullable().optional(),
});

const updateSessionTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

chatRoutes.post("/chats", async (c) => {
  const payload = await parseJson(c, createSessionSchema);
  return jsonOk(c, await createChatSession(payload.agent_thread_id, payload.title), 201);
});

chatRoutes.get("/chats", async (c) => jsonOk(c, await listChatSessions()));
chatRoutes.get("/chats/:sessionId", async (c) =>
  jsonOk(c, await getChatSession(c.req.param("sessionId"))),
);

/** 读取会话全部消息 */
chatRoutes.get("/chats/:sessionId/messages", async (c) =>
  jsonOk(c, await getChatSessionMessages(c.req.param("sessionId"))),
);

chatRoutes.delete("/chats/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getChatSession(sessionId).catch(() => null);
  const result = await deleteChatSession(sessionId);
  void logOperation({
    action: "delete",
    category: "chat",
    targetName: session?.title ?? sessionId,
  });
  return jsonOk(c, result);
});

/** 更新会话标题（按首条消息自动命名） */
chatRoutes.patch("/chats/:sessionId", async (c) => {
  const payload = await parseJson(c, updateSessionTitleSchema);
  return jsonOk(c, await updateChatSessionTitle(c.req.param("sessionId"), payload.title));
});
