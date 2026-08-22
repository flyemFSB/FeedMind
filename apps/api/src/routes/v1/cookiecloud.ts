import { Hono } from "hono";
import type { Context } from "hono";
import { PlatformId } from "@feedmind/contracts";
import { jsonOk, jsonError } from "../../lib/http.js";
import {
  saveConfig,
  storeEncrypted,
  getConfig,
  getCookies,
  getAllCookies,
  saveManualCookies,
  decrypt,
  checkPlatformCookie,
  parseUpdateBody,
} from "../../modules/cookiecloud/service.js";
import { logOperation } from "../../modules/ops-log/service.js";
import { logger } from "../../lib/logger.js";

export const cookieCloudRoutes = new Hono();

// 保存 UUID + 密码配置（供 CookieCloud 扩展推送时解密）
cookieCloudRoutes.post("/cookiecloud/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const {
    uuid,
    password,
    crypto_type = "legacy",
  } = body as {
    uuid?: string;
    password?: string;
    crypto_type?: string;
  };

  if (!uuid || !password) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 password 不能为空");
  }

  await saveConfig(uuid, password, crypto_type);
  void logOperation({
    action: "update",
    target: "cookie_store",
    targetName: "CookieCloud",
    detail: "更新配置",
  });
  return jsonOk(c, { action: "done" });
});

// 查询已有配置（前端预填 UUID）
cookieCloudRoutes.get("/cookiecloud/config/:uuid", async (c) => {
  const row = await getConfig(c.req.param("uuid"));
  if (!row) return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的配置");
  return jsonOk(c, { uuid: row.uuid, crypto_type: row.cryptoType });
});

// CookieCloud 扩展上传加密数据（可能 gzip 压缩），自动解密并写入 cookie_store
cookieCloudRoutes.post("/cookiecloud/update", async (c) => {
  let body: ReturnType<typeof parseUpdateBody>;
  try {
    const raw = Buffer.from(await c.req.arrayBuffer());
    body = parseUpdateBody(raw, c.req.header("content-encoding") ?? null);
  } catch {
    return jsonError(c, 400, "INVALID_JSON", "请求体解析失败（不支持 gzip 或非法 JSON）");
  }

  const { uuid, encrypted, crypto_type = "legacy" } = body;

  if (!uuid || !encrypted) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 encrypted 不能为空");
  }

  try {
    await storeEncrypted(uuid, encrypted, crypto_type);
  } catch (err) {
    // 解密失败必须向扩展暴露（400），否则扩展显示同步成功但数据并未入库
    return jsonError(c, 400, "DECRYPT_FAILED", err instanceof Error ? err.message : "解密失败");
  }
  // 官方协议响应体：扩展判定成功靠 result.action === 'done'（严格匹配，不能用 jsonOk 信封）
  return c.json({ action: "done" });
});

// 下载加密数据（官方 /get 协议）：不传 password 返回 encrypted 原始字符串，
// 传 password 解密后返回内容；同时支持 POST（官方文档标注 POST/GET 均可）。
// 扩展不调用此接口（仅上传），但对齐官方格式可兼容第三方 CookieCloud 客户端。
async function getCookieData(c: Context) {
  const uuid = c.req.param("uuid") ?? "";
  const row = await getConfig(uuid);
  if (!row) return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的数据");
  // 尚无扩展推送数据时无法验证密码，返回空标记避免误报解密失败
  if (!row.encrypted) return jsonOk(c, { empty: true });

  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  const password = c.req.query("password") ?? body.password;
  // 无密码：返回官方协议格式 {encrypted, crypto_type}——扩展 download 用
  // response.json() 解析并检查 result.encrypted（裸文本会导致解析失败）
  if (!password) {
    return c.json({ encrypted: row.encrypted, crypto_type: row.cryptoType });
  }

  try {
    return jsonOk(c, decrypt(uuid, row.encrypted, password, row.cryptoType));
  } catch (err) {
    logger.error({ err }, "CookieCloud /get 解密失败");
    return jsonError(c, 400, "DECRYPT_FAILED", "解密失败，请检查 UUID 与密码");
  }
}
cookieCloudRoutes.get("/cookiecloud/get/:uuid", getCookieData);
cookieCloudRoutes.post("/cookiecloud/get/:uuid", getCookieData);

// 获取所有平台的明文 cookie
cookieCloudRoutes.get("/cookiecloud/cookies", async (c) => {
  const cookies = await getAllCookies();
  return jsonOk(c, cookies);
});

// 获取指定平台的明文 cookie
cookieCloudRoutes.get("/cookiecloud/cookies/:platform", async (c) => {
  const result = PlatformId.safeParse(c.req.param("platform"));
  if (!result.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${c.req.param("platform")}`);
  }
  const cookies = await getCookies(result.data);
  return jsonOk(c, cookies);
});

// 校验指定平台 Cookie 登录态（纯 HTTP，无浏览器窗口）
cookieCloudRoutes.post("/cookiecloud/check/:platform", async (c) => {
  const result = PlatformId.safeParse(c.req.param("platform"));
  if (!result.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${c.req.param("platform")}`);
  }
  const data = await checkPlatformCookie(result.data);
  return jsonOk(c, data);
});

// 手动解密：密码未保存/存错时扩展推送的数据无法自动解密，这是唯一能验证
// 密码与推送格式的排查入口（curl 调用）。明文 cookie 本就有 /cookies 接口，
// 此接口不新增明文出口。crypto_type 可传参覆盖：web 端保存配置时硬编码 legacy，
// 若扩展实际用 aes-128-cbc-fixed（0.3.0+ 默认），不覆盖会导致调试解密误导。
cookieCloudRoutes.post("/cookiecloud/decrypt", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { uuid, password, crypto_type } = body as {
    uuid?: string;
    password?: string;
    crypto_type?: string;
  };

  if (!uuid || !password) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 password 不能为空");
  }

  const row = await getConfig(uuid);
  if (!row?.encrypted) {
    return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的加密数据");
  }

  try {
    const data = decrypt(uuid, row.encrypted, password, crypto_type ?? row.cryptoType);
    return jsonOk(c, data);
  } catch (err) {
    logger.error({ err, uuid }, "CookieCloud 手动解密失败");
    return jsonError(c, 400, "DECRYPT_FAILED", "解密失败，请检查 UUID 与密码");
  }
});

// 保存手动输入的 cookie（账号 Cookie）
cookieCloudRoutes.post("/cookiecloud/cookies", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { platform, cookies } = body as { platform?: string; cookies?: string };

  if (!platform || !cookies) {
    return jsonError(c, 400, "MISSING_FIELDS", "platform 和 cookies 不能为空");
  }

  const platformResult = PlatformId.safeParse(platform);
  if (!platformResult.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${platform}`);
  }

  await saveManualCookies(platformResult.data, cookies);
  void logOperation({
    action: "update",
    target: "cookie_store",
    targetName: platformResult.data,
    detail: "更新 Cookie",
  });
  return jsonOk(c, { action: "done" });
});
