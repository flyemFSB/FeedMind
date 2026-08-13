// ─── 一键创建应用（扫码接入） ─────────────────────────────
// 官方协议：OAuth 2.0 Device Authorization Grant（RFC 8628）
// 端点：POST https://accounts.feishu.cn/oauth/v1/app/registration（form 编码）
// 流程：begin 拿二维码 → 用户扫码 → poll 轮询拿 App ID / App Secret
// 实现对齐官方 SDK（@larksuiteoapi/node-sdk registerApp）：
// authorization_pending / slow_down 以 HTTP 400 + error 字段返回，属正常等待，
// 只有明确的错误值（access_denied / expired_token 等）才终止流程，不看 HTTP 状态码

import { gzipSync } from "node:zlib";

import { HttpError } from "../../lib/http.js";

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

// 飞书错误码 → 用户可读中文；不暴露英文 error_description（安全 + 语义）
const FEISHU_ERROR_ZH: Record<string, string> = {
  access_denied: "授权被拒绝，请重新扫码",
  expired_token: "二维码已过期，请重新扫码",
  invalid_grant: "授权已失效，请重新扫码",
  invalid_client: "应用凭据无效，请重新扫码",
  unsupported_grant_type: "不支持的授权方式",
};

function feishuErrorZh(code?: string): string {
  if (code && FEISHU_ERROR_ZH[code]) return FEISHU_ERROR_ZH[code];
  return "授权失败或二维码已过期，请重新扫码";
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
  let data: RegistrationData;
  try {
    ({ data } = await postRegistration(REGISTRATION_URL, {
      action: "begin",
      archetype: "PersonalAgent",
      auth_method: "client_secret",
      request_user_info: "open_id",
    }));
  } catch {
    // fetch 网络错误不向用户暴露英文 TypeError
    throw new HttpError(
      502,
      "REGISTER_BEGIN_FAILED",
      "无法连接飞书服务，请检查网络后重试",
      {},
      {
        i18nKey: "apiError.feishuNetworkError",
      },
    );
  }
  if (!data.device_code || !data.verification_uri_complete) {
    throw new HttpError(
      502,
      "REGISTER_BEGIN_FAILED",
      feishuErrorZh(data.error),
      {},
      {
        i18nKey: "apiError.feishuAuthFailed",
      },
    );
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
  // 飞书原始错误码（如 access_denied），供前端按词条翻译（zh/en 双语）
  errorCode?: string;
}

export async function pollRegistration(deviceCode: string): Promise<RegistrationPollResult> {
  const { data } = await postRegistration(REGISTRATION_URL, {
    action: "poll",
    device_code: deviceCode,
  });

  if (data.client_id && data.client_secret) {
    return { status: "success", appId: data.client_id, appSecret: data.client_secret };
  }
  // authorization_pending / slow_down 属正常等待，仅明确错误值才终止
  if (data.error && data.error !== "authorization_pending" && data.error !== "slow_down") {
    return {
      status: "error",
      error: feishuErrorZh(data.error),
      errorCode: data.error,
    };
  }
  return { status: "pending" };
}
