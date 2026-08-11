/**
 * Cookie 保活调度。
 *
 * - weread：wr_skey 约 60-90 分钟过期，靠加载 weread.qq.com 触发前端续期，
 *   保活间隔取 2 倍余量（30 分钟），刷新后把新 Cookie 写回 cookie_store。
 * - bilibili/zhihu/xiaohongshu：会话长（月级），仅低频校验登录态，失效时落库供前端提示。
 * - douyin：无可靠的轻量鉴权接口，无法校验，失效后由用户重新登录。
 *
 * 仅在桌面应用（注册了登录处理器）下启动；standalone 无 CDP，爬虫不可用。
 */
import { refreshWereadCookies } from "@feedmind/crawler-core";
import { checkPlatformCookie, getCookies, joinCookies, replacePlatformCookies } from "./service.js";
import { getLoginHandler } from "./bridge.js";
import { logger } from "../../lib/logger.js";

const WEREAD_KEEPALIVE_MS = 30 * 60 * 1000;
const VALIDATE_MS = 12 * 60 * 60 * 1000;

/** 微信读书：注入现有 Cookie → 页面加载触发 skey 刷新 → 写回新 Cookie */
async function keepaliveWeread(): Promise<void> {
  const rows = await getCookies("weread");
  if (rows.length === 0) return; // 尚未登录，跳过

  const cookies = joinCookies(rows);
  const result = await refreshWereadCookies(cookies);
  if (result.valid && result.cookies) {
    // 保活刷新即已确认登录态有效，valid 落 true，避免下轮校验前被读成"未知"
    await replacePlatformCookies("weread", result.cookies, true);
    logger.info("微信读书 Cookie 保活刷新完成");
  } else {
    await checkPlatformCookie("weread");
    logger.warn("微信读书 Cookie 保活失败，登录态可能已失效");
  }
}

/** 长会话平台低频校验，落库 valid/checkedAt 供前端状态展示 */
async function validatePlatforms(): Promise<void> {
  await Promise.allSettled(["bilibili", "zhihu", "xiaohongshu"].map((p) => checkPlatformCookie(p)));
}

/** 启动保活调度（仅桌面应用调用） */
export function startKeepAlive(): void {
  if (!getLoginHandler()) return; // 非桌面环境：无登录来源，跳过

  // 启动即刷一次，让 weread skey 立即新鲜
  void keepaliveWeread().catch((err) => logger.warn({ err }, "微信读书保活初始化失败"));
  setInterval(() => {
    void keepaliveWeread().catch((err) => logger.warn({ err }, "微信读书保活失败"));
  }, WEREAD_KEEPALIVE_MS);
  setInterval(() => {
    void validatePlatforms().catch((err) => logger.warn({ err }, "平台 Cookie 校验失败"));
  }, VALIDATE_MS);
}
