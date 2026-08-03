import { eq } from "drizzle-orm";
import { db, remoteConnections } from "@feedmind/db";
import { randomUUID } from "node:crypto";
import { Client, AppType, EventDispatcher, WSClient, LoggerLevel } from "@larksuiteoapi/node-sdk";
import { logger } from "../../lib/logger.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";

let sdkClient: Client | null = null;
let wsClient: WSClient | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let isReconnecting = false;
let isStopping = false;

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

async function getConfig() {
  const [conn] = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, "feishu"))
    .limit(1);
  if (!conn?.config) return null;
  try {
    return { ...JSON.parse(conn.config), connId: conn.id };
  } catch {
    return null;
  }
}

function ensureClient(cfg: { appId: string; appSecret: string }): Client {
  if (sdkClient) {
    const cached = sdkClient as unknown as { appId?: string; appSecret?: string };
    if (cached.appId === cfg.appId && cached.appSecret === cfg.appSecret) return sdkClient;
  }
  sdkClient = new Client({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    appType: AppType.SelfBuild,
  });
  return sdkClient;
}

function buildCardJson(markdownContent: string): string {
  const MAX_TABLES = 4;
  const tableCount =
    (markdownContent.match(/^\|/gm)?.length ?? 0) > 0
      ? (markdownContent.match(/\n\|-+\|/g)?.length ?? 0)
      : 0;

  let elements: { tag: "markdown"; content: string }[];
  if (tableCount <= MAX_TABLES) {
    elements = [{ tag: "markdown", content: markdownContent }];
  } else {
    elements = markdownContent.split(/\n---+\n/).map((s) => ({
      tag: "markdown" as const,
      content: s.trim(),
    }));
  }

  return JSON.stringify({
    schema: "2.0",
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "FeedMind" },
    },
    body: { elements },
  });
}

async function sendReply(client: Client, openId: string, content: string): Promise<void> {
  await client.im.message.create({
    params: { receive_id_type: "open_id" },
    data: { receive_id: openId, content: buildCardJson(content), msg_type: "interactive" },
  });
  logger.info({ openId, contentLen: content.length }, "飞书回复消息");
}

// 飞书 WebSocket 事件负载结构（仅用到消息体与发送者）
interface FeishuWsEvent {
  message?: {
    chat_type?: string;
    message_type?: string;
    content?: string;
  };
  sender?: {
    sender_type?: string;
    sender_id?: { open_id?: string };
  };
}

// WSClient 底层 WebSocket（SDK 未公开该字段类型，仅按需访问）
interface FeishuWsHandle {
  ws?: {
    readyState: number;
    removeAllListeners: (event?: string) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    close: () => void;
  };
}

function buildMessageHandler() {
  return async (data: FeishuWsEvent) => {
    const msg = data.message;
    const sender = data.sender;
    if (!msg || !sender) return;

    if (msg.chat_type !== "p2p" || msg.message_type !== "text" || sender.sender_type !== "user")
      return;

    let userText: string;
    try {
      userText = JSON.parse(msg.content ?? "").text ?? "";
    } catch {
      userText = msg.content ?? "";
    }
    if (!userText.trim()) return;

    // openId 提到外层，catch 兜底回信时也需要它
    const openId = sender.sender_id?.open_id;
    if (!openId) return;

    void (async () => {
      let feishuClient: Client | undefined;
      try {
        const cfg = await getConfig();
        if (!cfg) return;

        feishuClient = ensureClient(cfg);
        const threadId = `feishu:${openId}`;

        const stream = await feedmindAgent.stream(userText, {
          memory: { thread: threadId, resource: threadId },
        });
        let reply = "";
        for await (const chunk of stream.fullStream) {
          if (chunk.type === "text-delta") {
            reply += chunk.payload.text;
          }
        }
        reply = reply.trimStart();

        const content = reply || "我没有生成有效的回复，请换个方式描述你的问题。";
        if (!reply) logger.warn({ openId, threadId }, "Agent 返回空文本，发送提示");
        await sendReply(feishuClient, openId, content);
      } catch (err) {
        logger.error({ err }, "Agent 回复失败");
        if (feishuClient) {
          feishuClient.im.message
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
      }
    })();
  };
}

function clearConnectionTimers(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeWsClient(): void {
  if (!wsClient) return;
  try {
    const ws = (wsClient as FeishuWsHandle).ws;
    if (ws?.removeAllListeners) ws.removeAllListeners("close");
    if (ws?.removeAllListeners) ws.removeAllListeners("error");
    if (ws?.close) ws.close();
  } catch {
    /* closeWsClient 尽力而为 */
  }
  wsClient = null;
}

async function reconnect(): Promise<void> {
  if (isReconnecting || isStopping) return;
  isReconnecting = true;
  try {
    clearConnectionTimers();
    closeWsClient();
    await new Promise((r) => setTimeout(r, 200));
    await startLongConnection();
  } finally {
    isReconnecting = false;
  }
}

function scheduleReconnect(): void {
  if (isStopping || reconnectTimer || isReconnecting) return;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);
  reconnectAttempt++;
  logger.info({ delay, attempt: reconnectAttempt }, "飞书计划重连");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void reconnect();
  }, delay);
}

function startHealthCheck(): void {
  clearConnectionTimers();
  healthCheckTimer = setInterval(() => {
    if (isStopping) return;
    try {
      const ws = (wsClient as FeishuWsHandle)?.ws;
      if (ws?.readyState === 3) {
        logger.warn("健康检查：飞书 WebSocket 已关闭，准备重连");
        scheduleReconnect();
      }
    } catch {
      /* 健康检查尽力而为 */
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

function attachWsEventListeners(): void {
  try {
    const ws = (wsClient as FeishuWsHandle)?.ws;
    if (!ws) return;
    ws.on("close", () => {
      if (!isStopping) {
        logger.warn("飞书 WebSocket 连接关闭，准备重连");
        scheduleReconnect();
      }
    });
    ws.on("error", (err: unknown) => {
      logger.error({ err }, "飞书 WebSocket 连接错误");
      if (!isStopping) scheduleReconnect();
    });
  } catch {
    /* attachWsEventListeners 尽力而为 */
  }
}

export async function startLongConnection(): Promise<void> {
  isStopping = false;
  const cfg = await getConfig();
  if (!cfg?.appId || !cfg?.appSecret) {
    logger.info("飞书未配置，跳过长连接启动");
    return;
  }

  wsClient = null;
  clearConnectionTimers();

  const ed = new EventDispatcher({}).register({
    "im.message.receive_v1": buildMessageHandler(),
  });

  wsClient = new WSClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    loggerLevel: LoggerLevel.debug,
  });

  try {
    await wsClient.start({ eventDispatcher: ed });
    logger.info("飞书 WebSocket 长连接已建立");

    await db
      .update(remoteConnections)
      .set({ status: "connected", error: null, updatedAt: new Date().toISOString() })
      .where(eq(remoteConnections.platform, "feishu"));

    reconnectAttempt = 0;
    startHealthCheck();
    attachWsEventListeners();
  } catch (err) {
    logger.error({ err }, "飞书长连接启动失败");
    wsClient = null;
    await db
      .update(remoteConnections)
      .set({ status: "error", error: String(err), updatedAt: new Date().toISOString() })
      .where(eq(remoteConnections.platform, "feishu"));
    scheduleReconnect();
  }
}

export function stopLongConnection(): void {
  isStopping = true;
  clearConnectionTimers();
  closeWsClient();
  logger.info("飞书长连接已断开");
}

export async function saveAndVerify(config: { appId: string; appSecret: string }): Promise<void> {
  const c = new Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: AppType.SelfBuild,
  });
  try {
    // 官方 API：POST /open-apis/auth/v3/tenant_access_token/internal
    // 请求体必须携带 app_id / app_secret，code !== 0 即凭证无效
    const res = await c.auth.tenantAccessToken.internal({
      data: { app_id: config.appId, app_secret: config.appSecret },
    });
    if (res.code !== 0) throw new Error(res.msg ?? "凭证无效");
  } catch (err) {
    const apiError = err as { response?: { data?: { msg?: string } } } | undefined;
    throw new Error(apiError?.response?.data?.msg ?? "凭证无效", { cause: err });
  }

  const [existing] = await db
    .select()
    .from(remoteConnections)
    .where(eq(remoteConnections.platform, "feishu"))
    .limit(1);

  const configJson = JSON.stringify(config);
  const now = new Date().toISOString();

  if (existing) {
    await db
      .update(remoteConnections)
      .set({ config: configJson, status: "connected", updatedAt: now })
      .where(eq(remoteConnections.id, existing.id));
  } else {
    await db.insert(remoteConnections).values({
      id: randomUUID(),
      platform: "feishu",
      label: "飞书机器人",
      status: "connected",
      config: configJson,
      createdAt: now,
      updatedAt: now,
    });
  }

  sdkClient = null;
  stopLongConnection();
  await startLongConnection();
}

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
  logger.info({ receiveId, msgType, contentLen: content.length }, "飞书主动发送消息");
}

export async function getFeishuConfig() {
  return getConfig();
}
