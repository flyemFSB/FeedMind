import { db, remoteConnections } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Client, AppType, EventDispatcher, WSClient, LoggerLevel } from "@larksuiteoapi/node-sdk";
import { logger } from "../../lib/logger.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";
import { saveChatSession, getChatSessionMessages } from "../chats/service.js";

let client: Client | null = null;
let wsClient: WSClient | null = null;

async function getConfig() {
  const conn = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, "feishu"))
    .get();
  if (!conn?.config) return null;
  try {
    return { ...JSON.parse(conn.config), connId: conn.id };
  } catch {
    return null;
  }
}

function ensureClient(cfg: { appId: string; appSecret: string }): Client {
  // 若缓存 client 存在且凭据匹配则复用，否则重建
  if (client) {
    const cached = client as any;
    if (cached.appId === cfg.appId && cached.appSecret === cfg.appSecret) return client;
  }
  client = new Client({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    appType: AppType.SelfBuild,
  });
  return client;
}

/** 构建飞书消息卡片 JSON（支持 Markdown 渲染） */
function buildCardJson(markdownContent: string): string {
  // 飞书 markdown 元素单次最大约 4096 字符，超长截断并提示
  const MAX_LEN = 4000;
  const truncated =
    markdownContent.length > MAX_LEN
      ? markdownContent.slice(0, MAX_LEN) + "\n\n…（内容过长，已截断）"
      : markdownContent;
  return JSON.stringify({
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "FeedMind" },
    },
    elements: [{ tag: "markdown", content: truncated }],
  });
}

/** 构建 im.message.receive_v1 事件处理器 */
function buildMessageHandler() {
  return async (data: any) => {
    const msg = data.message;
    const sender = data.sender;
    if (!msg || !sender) return;

    logger.info(
      {
        chatType: msg.chat_type,
        msgType: msg.message_type,
        sender: sender.sender_id?.open_id,
        content: msg.content,
      },
      "飞书收到消息",
    );

    // 处理单聊文本消息
    if (msg.chat_type === "p2p" && msg.message_type === "text" && sender.sender_type === "user") {
      // 解析用户文本（飞书文本消息 content 格式：{"text":"xxx"}）
      let userText: string;
      try {
        userText = JSON.parse(msg.content).text ?? "";
      } catch {
        userText = msg.content;
      }
      if (!userText.trim()) return;

      const cfg = await getConfig();
      if (!cfg) return;
      const c = ensureClient(cfg);
      const openId = sender.sender_id.open_id;

      // 每个飞书用户对应一个持久会话，格式: feishu:{openId}
      const threadId = `feishu:${openId}`;

      // 异步调用 Agent，不阻塞事件回调（飞书长连接 3s 超时限制）
      void (async () => {
        try {
          // 保存用户消息到会话
          const userMsgId = `feishu-${Date.now()}-user`;
          await saveChatSession(threadId, {
            title: userText.slice(0, 30),
            messages: [
              {
                agent_message_id: userMsgId,
                role: "user",
                content: userText,
                status: "completed",
                model: "",
                metadata: {},
              },
            ],
          });

          // 从 DB 读取该会话的历史消息，作为 Agent 的上下文
          const history = await getChatSessionMessages(threadId);
          const context = history
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

          // 调用 Agent，通过 context 参数注入对话历史实现多轮记忆
          const result = await feedmindAgent.generate(userText, { context });

          if (result.text) {
            const reply = result.text.trimStart();
            logger.info(
              {
                openId,
                threadId,
                replyLength: reply.length,
                reply,
              },
              "飞书 Agent 回复",
            );

            // 保存助手回复到会话
            await saveChatSession(threadId, {
              messages: [
                {
                  agent_message_id: `feishu-${Date.now()}-assistant`,
                  role: "assistant",
                  content: reply,
                  status: "completed",
                  model: "",
                  metadata: {},
                },
              ],
            });

            await c.im.message.create({
              params: { receive_id_type: "open_id" },
              data: {
                receive_id: openId,
                content: buildCardJson(reply),
                msg_type: "interactive",
              },
            });
          }
        } catch (err: any) {
          logger.error({ err }, "Agent 回复失败");
          c.im.message
            .create({
              params: { receive_id_type: "open_id" },
              data: {
                receive_id: openId,
                content: buildCardJson("⚠️ 处理消息时出错，请稍后重试。"),
                msg_type: "interactive",
              },
            })
            .catch(() => {});
        }
      })();
    }
  };
}

// ─── 长连接模式 ──────────────────────────────────────────
/**
 * 启动 WebSocket 长连接，通过 SDK WSClient 主动连接飞书服务器。
 * 无需公网 IP / 内网穿透，适合本地开发和无固定 IP 的部署环境。
 */
export async function startLongConnection(): Promise<void> {
  const cfg = await getConfig();
  if (!cfg?.appId || !cfg?.appSecret) {
    logger.info("飞书未配置，跳过长连接启动");
    return;
  }

  // 若已有连接且凭据未变则跳过
  if (wsClient) {
    const cached = wsClient as any;
    if (cached.appId === cfg.appId && cached.appSecret === cfg.appSecret) {
      logger.info("飞书长连接已存在且凭据未变，跳过");
      return;
    }
    stopLongConnection();
  }

  // 长连接模式下事件为明文推送，不需要 encryptKey
  const ed = new EventDispatcher({}).register({
    "im.message.receive_v1": buildMessageHandler(),
  });

  wsClient = new WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    loggerLevel: LoggerLevel.warn,
  });

  try {
    await wsClient.start({ eventDispatcher: ed });
    logger.info("飞书 WebSocket 长连接已建立");

    await db
      .update(remoteConnections)
      .set({ status: "connected", updatedAt: new Date().toISOString() })
      .where(eq(remoteConnections.platform, "feishu"));
  } catch (err) {
    logger.error({ err }, "飞书长连接启动失败");
    wsClient = null;
    await db
      .update(remoteConnections)
      .set({ status: "error", error: String(err), updatedAt: new Date().toISOString() })
      .where(eq(remoteConnections.platform, "feishu"));
  }
}

/** 停止长连接（配置变更或服务关闭时调用） */
export function stopLongConnection(): void {
  if (wsClient) {
    wsClient = null;
    logger.info("飞书长连接已断开");
  }
}

// ─── 保存配置并验证 ──────────────────────────────────────
export async function saveAndVerify(config: { appId: string; appSecret: string }): Promise<void> {
  // 用 SDK Client 验证凭证有效性
  const c = new Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: AppType.SelfBuild,
  });
  try {
    await c.request({
      method: "POST",
      url: "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    });
  } catch (err: any) {
    throw new Error(err?.response?.data?.msg ?? "凭证无效", { cause: err });
  }

  // 存入 DB
  const existing = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, "feishu"))
    .get();
  const configJson = JSON.stringify(config);
  if (existing) {
    await db
      .update(remoteConnections)
      .set({ config: configJson, status: "connected", updatedAt: new Date().toISOString() })
      .where(eq(remoteConnections.id, existing.id));
  } else {
    await db.insert(remoteConnections).values({
      id: randomUUID(),
      platform: "feishu",
      label: "飞书机器人",
      status: "connected",
      config: configJson,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  // 配置变更后清除缓存并重启长连接
  client = null;
  stopLongConnection();
  await startLongConnection();
}

// ─── 发送消息 ────────────────────────────────────────────
export async function sendMessage(
  receiveId: string,
  msgType: string,
  content: string,
  receiveIdType: "open_id" | "union_id" | "user_id" | "email" | "chat_id" = "open_id",
): Promise<void> {
  const cfg = await getConfig();
  if (!cfg) throw new Error("飞书未配置");
  const c = ensureClient(cfg);
  await c.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: receiveId, msg_type: msgType, content },
  });
}

// ─── 获取配置状态 ────────────────────────────────────────
export async function getFeishuConfig() {
  return getConfig();
}
