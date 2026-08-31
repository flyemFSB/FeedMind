import { Hono } from "hono";
import { z } from "zod";
import { jsonOk, parseJson } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessionMessagesPage,
  listChatSessions,
  updateChatSessionTitle,
} from "../../modules/chats/service.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";
import { logOperation } from "../../modules/ops-log/service.js";

export const chatRoutes = new Hono();

const createSessionSchema = z.object({
  agent_thread_id: z.string().optional(),
  title: z.string().nullable().optional(),
});

const updateSessionTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

// catch 兜住 NaN/越界等垃圾输入：Math.max/min 链对 NaN 直接放行，会把 NaN 一路传进 DB 分页
const messagesPageQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0).catch(0),
  limit: z.coerce.number().int().min(1).max(100).default(30).catch(30),
});

chatRoutes.post("/chats", async (c) => {
  const payload = await parseJson(c, createSessionSchema);
  return jsonOk(c, await createChatSession(payload.agent_thread_id, payload.title), 201);
});

chatRoutes.get("/chats", async (c) => jsonOk(c, await listChatSessions()));
chatRoutes.get("/chats/:sessionId", async (c) =>
  jsonOk(c, await getChatSession(c.req.param("sessionId"))),
);

/** 读取会话消息（分页：page=0 为最新一页，递增向前翻更早的消息） */
chatRoutes.get("/chats/:sessionId/messages", async (c) => {
  const threadId = c.req.param("sessionId");
  const { page, limit } = messagesPageQuerySchema.parse({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  return jsonOk(c, await getChatSessionMessagesPage(threadId, page, limit));
});

chatRoutes.delete("/chats/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await getChatSession(sessionId).catch(() => null);
  // 同步清理 Agent Memory 中的 thread：只删 feedmind.db 的会话行会让
  // mastra.db 里的消息永久残留，长期运行无限膨胀。失败不阻塞删除主流程。
  const memory = await feedmindAgent.getMemory();
  if (memory) {
    await memory
      .deleteThread(sessionId)
      .catch((err: unknown) => logger.error({ err }, "清理 Agent Memory thread 失败"));
  }
  const result = await deleteChatSession(sessionId);
  void logOperation({
    action: "delete",
    target: "chat_session",
    targetName: session?.title ?? sessionId,
  });
  return jsonOk(c, result);
});

/** 更新会话标题（按首条消息自动命名） */
chatRoutes.patch("/chats/:sessionId", async (c) => {
  const payload = await parseJson(c, updateSessionTitleSchema);
  return jsonOk(c, await updateChatSessionTitle(c.req.param("sessionId"), payload.title));
});
