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
} from "../../modules/cookiecloud/service.js";
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
  const body = await c.req.json().catch(() => ({}));
  const {
    uuid,
    encrypted,
    crypto_type = "legacy",
  } = body as {
    uuid?: string;
    encrypted?: string;
    crypto_type?: string;
  };

  if (!uuid || !encrypted) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 encrypted 不能为空");
  }

  await storeEncrypted(uuid, encrypted, crypto_type);
  return jsonOk(c, { action: "done" });
});

// 下载加密数据（官方 /get 协议）：不传 password 返回 encrypted 原始字符串，
// 传 password 解密后返回内容；同时支持 POST（官方文档标注 POST/GET 均可）。
// 扩展不调用此接口（仅上传），但对齐官方格式可兼容第三方 CookieCloud 客户端。
async function getCookieData(c: Context) {
  const uuid = c.req.param("uuid") ?? "";
  const row = await getConfig(uuid);
  if (!row) return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的数据");

  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  const password = c.req.query("password") ?? body.password;
  if (!password) return c.text(row.encrypted);

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
  return jsonOk(c, { action: "done" });
});
