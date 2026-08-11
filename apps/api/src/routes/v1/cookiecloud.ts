import { Hono } from "hono";
import { PlatformId } from "@feedmind/contracts";
import { checkCookie } from "@feedmind/crawler-core";
import { jsonOk, jsonError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import {
  getCookies,
  getAllCookies,
  saveManualCookies,
  checkPlatformCookie,
  replacePlatformCookies,
} from "../../modules/cookiecloud/service.js";
import { getLoginHandler } from "../../modules/cookiecloud/bridge.js";

// Cookie 管理路由（历史前缀保留 cookiecloud；CookieCloud 扩展同步已移除）
export const cookieCloudRoutes = new Hono();

// 获取所有平台的明文 cookie
cookieCloudRoutes.get("/cookiecloud/cookies", async (c) => {
  const cookies = await getAllCookies();
  return jsonOk(c, cookies);
});

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

// 校验指定平台 Cookie 登录态并更新 valid/checkedAt（账号 Cookie 刷新按钮）
cookieCloudRoutes.post("/cookiecloud/check/:platform", async (c) => {
  const platformParam = c.req.param("platform");
  const result = PlatformId.safeParse(platformParam);
  if (!result.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${platformParam}`);
  }
  const data = await checkPlatformCookie(result.data);
  return jsonOk(c, data);
});

// 应用内浏览器登录：Electron 主进程打开登录窗口，用户完成后捕获会话 Cookie 并入库
cookieCloudRoutes.post("/cookiecloud/login/:platform", async (c) => {
  const platformParam = c.req.param("platform");
  const result = PlatformId.safeParse(platformParam);
  if (!result.success) {
    return jsonError(c, 400, "INVALID_PLATFORM", `无效的平台: ${platformParam}`);
  }

  const handler = getLoginHandler();
  if (!handler) {
    return jsonError(c, 503, "DESKTOP_ONLY", "浏览器登录仅桌面应用支持，请使用 FeedMind 桌面应用");
  }

  try {
    const loginResult = await handler(result.data);
    if (loginResult.valid && loginResult.cookies) {
      // 应用内登录捕获后再校验一次登录态，避免把过期/残留 Cookie 当成功写库；
      // null 表示该平台不支持校验（douyin），仍接受
      const check = await checkCookie(result.data, loginResult.cookies);
      // check 为 null（douyin 不支持校验）时仍接受，valid 落 null
      if (check === false) {
        return jsonOk(c, {
          valid: false,
          reason: "登录后校验未通过，请确认账号已正确登录",
        });
      }
      await replacePlatformCookies(result.data, loginResult.cookies, check);
    }
    return jsonOk(c, loginResult);
  } catch (err) {
    logger.error({ err, platform: result.data }, "浏览器登录失败");
    return jsonError(c, 500, "LOGIN_FAILED", "登录失败，请重试");
  }
});

// 保存手动输入的 cookie（账号 Cookie）
cookieCloudRoutes.post("/cookiecloud/cookies", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { platform, cookies } = body;

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
