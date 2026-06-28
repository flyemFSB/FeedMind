import { Hono } from "hono";
import { PlatformId } from "@feedmind/contracts";
import { jsonOk, jsonError } from "../../lib/http.js";
import {
  saveConfig,
  storeEncrypted,
  getEncrypted,
  getCookies,
  getAllCookies,
  saveManualCookies,
  decrypt,
} from "../../modules/cookiecloud/service.js";

export const cookieCloudRoutes = new Hono();

// POST /api/v1/cookiecloud/config
// 保存 UUID + 密码配置
cookieCloudRoutes.post("/cookiecloud/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { uuid, password, crypto_type = "legacy" } = body;

  if (!uuid || !password) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 password 不能为空");
  }

  await saveConfig(uuid, password, crypto_type);
  return jsonOk(c, { action: "done" });
});

// POST /api/v1/cookiecloud/update
// CookieCloud 扩展上传加密数据，自动解密并写入 cookie_cloud
cookieCloudRoutes.post("/cookiecloud/update", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { uuid, encrypted, crypto_type = "legacy" } = body;

  if (!uuid || !encrypted) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 encrypted 不能为空");
  }

  await storeEncrypted(uuid, encrypted, crypto_type);
  return jsonOk(c, { action: "done" });
});

// GET /api/v1/cookiecloud/get/:uuid
// 下载加密数据（用于跨设备同步）
cookieCloudRoutes.get("/cookiecloud/get/:uuid", async (c) => {
  const uuid = c.req.param("uuid");
  const row = await getEncrypted(uuid);

  if (!row) {
    return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的数据");
  }

  return jsonOk(c, {
    encrypted: row.encrypted,
    crypto_type: row.cryptoType,
  });
});

// GET /api/v1/cookiecloud/cookies
// 获取所有平台的明文 cookie
cookieCloudRoutes.get("/cookiecloud/cookies", async (c) => {
  const cookies = await getAllCookies();
  return jsonOk(c, cookies);
});

// GET /api/v1/cookiecloud/cookies/:platform
// 获取指定平台的明文 cookie
cookieCloudRoutes.get("/cookiecloud/cookies/:platform", async (c) => {
  const platformParam = c.req.param("platform");
  const result = PlatformId.safeParse(platformParam);
  if (!result.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${platformParam}`);
  }
  const cookies = await getCookies(result.data);
  return jsonOk(c, cookies);
});

// POST /api/v1/cookiecloud/decrypt
// 手动解密（不需要预先配置密码）
cookieCloudRoutes.post("/cookiecloud/decrypt", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { uuid, password } = body;

  if (!uuid || !password) {
    return jsonError(c, 400, "MISSING_FIELDS", "uuid 和 password 不能为空");
  }

  const row = await getEncrypted(uuid);
  if (!row) {
    return jsonError(c, 404, "NOT_FOUND", "未找到该 UUID 对应的数据，请先上传");
  }

  try {
    const data = decrypt(uuid, row.encrypted, password, row.cryptoType);
    return jsonOk(c, data);
  } catch {
    return jsonError(c, 400, "DECRYPT_FAILED", "解密失败，请检查密码是否正确");
  }
});

// POST /api/v1/cookiecloud/cookies
// 保存手动输入的 cookie（账号 Cookie）
cookieCloudRoutes.post("/cookiecloud/cookies", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { platform, cookies } = body;

  if (!platform || !cookies) {
    return jsonError(c, 400, "MISSING_FIELDS", "platform 和 cookies 不能为空");
  }

  await saveManualCookies(platform, cookies);
  return jsonOk(c, { action: "done" });
});
