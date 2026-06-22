import { db, remoteConnections } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Client, AppType, EventDispatcher, WSClient, LoggerLevel } from "@larksuiteoapi/node-sdk";
import { logger } from "../../lib/logger.js";
import { feedmindAgent } from "../../mastra/agents/feedmind-agent.js";
import { saveChatSession, getChatSessionMessages } from "../chats/service.js";

let client: Client | null = null;
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

/** 构建飞书消息卡片 JSON（JSON 2.0，完整 Markdown 支持） */
function buildCardJson(markdownContent: string): string {
  // 单个 markdown 组件最多 4 个表格，超出则按段落分割（\n---\n 分隔章节）
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

/** 发送助手消息到飞书并持久化到会话 */
async function sendReply(
  client: Client,
  openId: string,
  threadId: string,
  content: string,
): Promise<void> {
  await saveChatSession(threadId, {
    messages: [
      {
        agent_message_id: `feishu-${Date.now()}-assistant`,
        role: "assistant",
        content,
        status: "completed",
        model: "",
        metadata: {},
      },
    ],
  });
  await client.im.message.create({
    params: { receive_id_type: "open_id" },
    data: { receive_id: openId, content: buildCardJson(content), msg_type: "interactive" },
  });
  logger.info({ openId, threadId, contentLen: content.length }, "飞书回复消息");
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

    // 只处理单聊文本消息
    if (msg.chat_type !== "p2p" || msg.message_type !== "text" || sender.sender_type !== "user")
      return;

    // 解析用户文本（飞书文本消息 content 格式：{"text":"xxx"}）
    let userText: string;
    try {
      userText = JSON.parse(msg.content).text ?? "";
    } catch {
      userText = msg.content;
    }
    if (!userText.trim()) return;

    // 异步调用 Agent，不阻塞事件回调（飞书长连接 3s 超时限制）
    void (async () => {
      let feishuClient: Client | undefined;
      try {
        const cfg = await getConfig();
        if (!cfg) {
          logger.warn({ sender: sender.sender_id?.open_id }, "飞书配置不存在，跳过回复");
          return;
        }

        feishuClient = ensureClient(cfg);
        const openId = sender.sender_id.open_id;
        const threadId = `feishu:${openId}`;

        // 保存用户消息到会话（先持久化，确保后续异常时消息不丢失）
        await saveChatSession(threadId, {
          title: userText.slice(0, 30),
          messages: [
            {
              agent_message_id: `feishu-${Date.now()}-user`,
              role: "user",
              content: userText,
              status: "completed",
              model: "",
              metadata: {},
            },
          ],
        });

        // 读取历史作为 Agent 上下文
        const history = await getChatSessionMessages(threadId);
        const context = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // 调用 Agent（使用 stream 以分离推理过程和最终答案）
        const stream = await feedmindAgent.stream(userText, { context });
        let reply = "";
        for await (const chunk of stream.fullStream) {
          if (chunk.type === "text-delta") {
            reply += chunk.payload.text;
          }
          // 跳过 reasoning-delta（思考过程）、tool-call 等
        }
        reply = reply.trimStart();

        const content = reply || "我没有生成有效的回复，请换个方式描述你的问题。";
        if (!reply) logger.warn({ openId, threadId }, "Agent 返回空文本，发送提示");
        await sendReply(feishuClient, openId, threadId, content);
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

// ─── 连接管理 ──────────────────────────────────────────

/** 清理所有定时器 */
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

/** 尝试关闭底层 WebSocket 并清空 wsClient */
function closeWsClient(): void {
  if (!wsClient) return;
  try {
    const ws = (wsClient as any).ws;
    if (ws?.removeAllListeners) ws.removeAllListeners("close");
    if (ws?.removeAllListeners) ws.removeAllListeners("error");
    if (ws?.close) ws.close();
  } catch {
    // 关闭阶段的异常无需处理
  }
  wsClient = null;
}

/** 断线重连（清除旧连接后启动新连接） */
async function reconnect(): Promise<void> {
  if (isReconnecting || isStopping) return;
  isReconnecting = true;
  try {
    clearConnectionTimers();
    closeWsClient();
    // 小幅延迟避免立即重连时端口/资源未释放
    await new Promise((r) => setTimeout(r, 200));
    await startLongConnection();
  } finally {
    isReconnecting = false;
  }
}

/** 指数退避重连调度 */
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

/** 启动连接健康检查（每 30 秒检测 WebSocket 状态） */
function startHealthCheck(): void {
  clearConnectionTimers();
  healthCheckTimer = setInterval(() => {
    if (isStopping) return;
    try {
      const ws = (wsClient as any)?.ws;
      // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      if (ws && ws.readyState === 3) {
        logger.warn("健康检查：飞书 WebSocket 已关闭，准备重连");
        scheduleReconnect();
      }
    } catch {
      // 检测异常不影响正常运行
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/** 监听底层 WebSocket 的 close/error 事件 */
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
  } catch {
    // 非关键，healthCheck 兜底
  }
}

// ─── 长连接模式 ──────────────────────────────────────────
/**
 * 启动 WebSocket 长连接，通过 SDK WSClient 主动连接飞书服务器。
 * 含断线自动重连 + 健康检查，无需公网 IP / 内网穿透。
 */
export async function startLongConnection(): Promise<void> {
  const cfg = await getConfig();
  if (!cfg?.appId || !cfg?.appSecret) {
    logger.info("飞书未配置，跳过长连接启动");
    return;
  }

  // 若已有连接则清理
  wsClient = null;
  clearConnectionTimers();

  // 长连接模式下事件为明文推送，不需要 encryptKey
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

/** 停止长连接（配置变更或服务关闭时调用） */
export function stopLongConnection(): void {
  isStopping = true;
  clearConnectionTimers();
  closeWsClient();
  logger.info("飞书长连接已断开");
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
  logger.info({ receiveId, msgType, contentLen: content.length }, "飞书主动发送消息");
}

// ─── 获取配置状态 ────────────────────────────────────────
export async function getFeishuConfig() {
  return getConfig();
}
