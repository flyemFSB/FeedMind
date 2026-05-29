import { Hono } from "hono";
import { chatSessionSnapshotSchema } from "@feedmind/contracts";
import { jsonOk, parseJson } from "../../lib/http.js";
import {
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
} from "../../modules/chats/service.js";

export const chatRoutes = new Hono();

chatRoutes.get("/chats", async (c) => jsonOk(c, await listChatSessions()));
chatRoutes.get("/chats/:sessionId", async (c) => jsonOk(c, await getChatSession(c.req.param("sessionId"))));
chatRoutes.put("/chats/:sessionId", async (c) => {
  const payload = await parseJson(c, chatSessionSnapshotSchema);
  return jsonOk(c, await saveChatSession(c.req.param("sessionId"), payload));
});
chatRoutes.delete("/chats/:sessionId", async (c) => jsonOk(c, await deleteChatSession(c.req.param("sessionId"))));
