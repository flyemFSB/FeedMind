// ─── 一键创建应用（扫码接入） ─────────────────────────────
// 官方协议：OAuth 2.0 Device Authorization Grant（RFC 8628）
// 端点：POST https://accounts.feishu.cn/oauth/v1/app/registration（form 编码）
// 流程：begin 拿二维码 → 用户扫码 → poll 轮询拿 App ID / App Secret
// 实现对齐官方 SDK（@larksuiteoapi/node-sdk registerApp）：
// authorization_pending / slow_down 以 HTTP 400 + error 字段返回，属正常等待，
// 只有明确的错误值（access_denied / expired_token 等）才终止流程，不看 HTTP 状态码

import { gzipSync } from "node:zlib";

const REGISTRATION_URL = "https://accounts.feishu.cn/oauth/v1/app/registration";

const REGISTRATION_ADDONS = {
  scopes: { tenant: ["im:message:send_as_bot"] },
  events: { items: { tenant: ["im.message.receive_v1"] } },
};

function encodeAddons(addons: object): string {
  return gzipSync(Buffer.from(JSON.stringify(addons)))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 飞书注册接口响应结构（未填字段即缺省）
interface RegistrationData {
  device_code?: string;
  verification_uri_complete?: string;
  error_description?: string;
  error?: string;
  interval?: number;
  expire_in?: number;
  client_id?: string;
  client_secret?: string;
}

async function postRegistration(
  url: string,
  body: Record<string, string>,
): Promise<{ status: number; data: RegistrationData }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let data: RegistrationData = {};
  try {
    data = JSON.parse(text) as RegistrationData;
  } catch {
    /* 非 JSON 响应按空对象处理 */
  }
  return { status: res.status, data };
}

export async function beginRegistration(): Promise<{
  deviceCode: string;
  qrUrl: string;
  interval: number;
  expireIn: number;
}> {
  const { data } = await postRegistration(REGISTRATION_URL, {
    action: "begin",
    archetype: "PersonalAgent",
    auth_method: "client_secret",
    request_user_info: "open_id",
  });
  if (!data.device_code || !data.verification_uri_complete) {
    throw new Error(data.error_description ?? "注册会话创建失败");
  }
  const qrUrl = new URL(data.verification_uri_complete);
  qrUrl.searchParams.set("from", "sdk");
  qrUrl.searchParams.set("tp", "sdk");
  qrUrl.searchParams.set("source", "feedmind");
  qrUrl.searchParams.set("addons", encodeAddons(REGISTRATION_ADDONS));
  return {
    deviceCode: data.device_code,
    qrUrl: qrUrl.toString(),
    interval: data.interval ?? 5,
    expireIn: data.expire_in ?? 600,
  };
}

export interface RegistrationPollResult {
  status: "pending" | "success" | "error";
  appId?: string;
  appSecret?: string;
  error?: string;
}

export async function pollRegistration(deviceCode: string): Promise<RegistrationPollResult> {
  const { data } = await postRegistration(REGISTRATION_URL, {
    action: "poll",
    device_code: deviceCode,
  });

  if (data.client_id && data.client_secret) {
    return { status: "success", appId: data.client_id, appSecret: data.client_secret };
  }
  // RFC 8628：authorization_pending / slow_down 以 HTTP 400 + error 字段返回，
  // 均属正常等待；只有明确的错误值才终止流程（与官方 SDK 一致，不看 HTTP 状态码）
  if (data.error && data.error !== "authorization_pending" && data.error !== "slow_down") {
    return {
      status: "error",
      error: data.error_description ?? data.error ?? "授权失败或二维码已过期",
    };
  }
  return { status: "pending" };
}
