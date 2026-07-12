import { client } from "@feedmind/db";
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
  const result = await client.execute({
    sql: "SELECT * FROM remote_connections WHERE platform = ?",
    args: ["feishu"],
  });
  const conn = result.rows[0] as any;
  if (!conn?.config) return null;
  try {
    return { ...JSON.parse(conn.config), connId: conn.id };
  } catch {
    return null;
  }
}

function ensureClient(cfg: { appId: string; appSecret: string }): Client {
  if (sdkClient) {
    const cached = sdkClient as any;
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

function buildMessageHandler() {
  return async (data: any) => {
    const msg = data.message;
    const sender = data.sender;
    if (!msg || !sender) return;

    if (msg.chat_type !== "p2p" || msg.message_type !== "text" || sender.sender_type !== "user")
      return;

    let userText: string;
    try {
      userText = JSON.parse(msg.content).text ?? "";
    } catch {
      userText = msg.content;
    }
    if (!userText.trim()) return;

    void (async () => {
      let feishuClient: Client | undefined;
      try {
        const cfg = await getConfig();
        if (!cfg) return;

        feishuClient = ensureClient(cfg);
        const openId = sender.sender_id.open_id;
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
      } catch (err: any) {
        logger.error({ err }, "Agent 回复失败");
        if (feishuClient) {
          feishuClient.im.message
            .create({
              params: { receive_id_type: "open_id" },
              data: {
                receive_id: sender.sender_id.open_id,
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
    const ws = (wsClient as any).ws;
    if (ws?.removeAllListeners) ws.removeAllListeners("close");
    if (ws?.removeAllListeners) ws.removeAllListeners("error");
    if (ws?.close) ws.close();
  } catch {}
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
    reconnect();
  }, delay);
}

function startHealthCheck(): void {
  clearConnectionTimers();
  healthCheckTimer = setInterval(() => {
    if (isStopping) return;
    try {
      const ws = (wsClient as any)?.ws;
      if (ws && ws.readyState === 3) {
        logger.warn("健康检查：飞书 WebSocket 已关闭，准备重连");
        scheduleReconnect();
      }
    } catch {}
  }, HEALTH_CHECK_INTERVAL_MS);
}

function attachWsEventListeners(): void {
  try {
    const ws = (wsClient as any)?.ws;
    if (!ws) return;
    ws.on("close", () => {
      if (!isStopping) {
        logger.warn("飞书 WebSocket 连接关闭，准备重连");
        scheduleReconnect();
      }
    });
    ws.on("error", (err: any) => {
      logger.error({ err }, "飞书 WebSocket 连接错误");
      if (!isStopping) scheduleReconnect();
    });
  } catch {}
}

export async function startLongConnection(): Promise<void> {
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

    await client.execute({
      sql: "UPDATE remote_connections SET status = ?, error = ?, updated_at = ? WHERE platform = ?",
      args: ["connected", null, new Date().toISOString(), "feishu"],
    });

    reconnectAttempt = 0;
    startHealthCheck();
    attachWsEventListeners();
  } catch (err) {
    logger.error({ err }, "飞书长连接启动失败");
    wsClient = null;
    await client.execute({
      sql: "UPDATE remote_connections SET status = ?, error = ?, updated_at = ? WHERE platform = ?",
      args: ["error", String(err), new Date().toISOString(), "feishu"],
    });
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
    await c.request({
      method: "POST",
      url: "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    });
  } catch (err: any) {
    throw new Error(err?.response?.data?.msg ?? "凭证无效", { cause: err });
  }

  const existing = await client.execute({
    sql: "SELECT * FROM remote_connections WHERE platform = ?",
    args: ["feishu"],
  });
  const row = existing.rows[0] as any;
  const configJson = JSON.stringify(config);
  const now = new Date().toISOString();

  if (row) {
    await client.execute({
      sql: "UPDATE remote_connections SET config = ?, status = ?, updated_at = ? WHERE id = ?",
      args: [configJson, "connected", now, row.id],
    });
  } else {
    await client.execute({
      sql: "INSERT INTO remote_connections (id, platform, label, status, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [randomUUID(), "feishu", "飞书机器人", "connected", configJson, now, now],
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
