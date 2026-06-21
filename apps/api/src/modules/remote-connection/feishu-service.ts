import { db, remoteConnections } from "@feedmind/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Client, AppType, EventDispatcher, generateChallenge } from "@larksuiteoapi/node-sdk";
import { logger } from "../../lib/logger.js";

let client: Client | null = null;
let dispatcher: EventDispatcher | null = null;

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

function getDispatcher(): EventDispatcher {
  if (dispatcher) return dispatcher;
  dispatcher = new EventDispatcher({}).register({
    "im.message.receive_v1": async (data: any) => {
      const { event } = data;
      const msg = event?.message;
      const sender = event?.sender;
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

      // 自动回复单聊文本
      if (msg.chat_type === "p2p" && msg.message_type === "text" && sender.sender_type === "user") {
        const cfg = await getConfig();
        if (!cfg) return;
        const c = ensureClient(cfg);
        c.request({
          method: "POST",
          url: "https://open.feishu.cn/open-apis/im/v1/messages",
          params: { receive_id_type: "open_id" },
          data: {
            receive_id: sender.sender_id.open_id,
            msg_type: "text",
            content: JSON.stringify({ text: "收到！我是 FeedMind 机器人 v0.1.0～" }),
          },
        }).catch((err: any) => logger.error({ err }, "自动回复失败"));
      }
    },
  });
  return dispatcher;
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
    throw new Error(err?.response?.data?.msg ?? "凭证无效");
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
  client = null;
  dispatcher = null; // 配置变更后重建 dispatcher，确保 encryptKey 生效
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
  await c.request({
    method: "POST",
    url: "https://open.feishu.cn/open-apis/im/v1/messages",
    params: { receive_id_type: receiveIdType },
    data: { receive_id: receiveId, msg_type: msgType, content },
  });
}

// ─── 获取配置状态 ────────────────────────────────────────
export async function getFeishuConfig() {
  return getConfig();
}

// ─── Webhook ──────────────────────────────────────────────
export async function handleWebhook(body: any): Promise<Response> {
  // 使用 SDK 的 generateChallenge 处理 url_verification（支持加密/非加密）
  const cfg = await getConfig();
  const { isChallenge, challenge } = generateChallenge(body, {
    encryptKey: cfg?.encryptKey ?? "",
  });
  if (isChallenge) {
    return new Response(JSON.stringify(challenge), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 用 EventDispatcher.invoke 处理事件（自动解密 + 分发）
  const handler = getDispatcher().handles.get("im.message.receive_v1") as
    | ((data: any) => any)
    | undefined;
  if (!handler) {
    return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
  }
  const ed = new EventDispatcher({ encryptKey: cfg?.encryptKey ?? "" }).register({
    "im.message.receive_v1": handler,
  });
  const value = await ed.invoke(body);

  return new Response(JSON.stringify(value ?? {}), {
    headers: { "Content-Type": "application/json" },
  });
}
