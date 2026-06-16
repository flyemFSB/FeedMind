/**
 * 微博辅助工具
 *
 * 处理微博 API 的 cookie 管理和自动续期。
 * - 移动端 API (m.weibo.cn) 请求
 * - Cookie 过期自动续期（通过 AgentBrowser 获取新 cookie）
 * - Cookie 续期冷却机制（防止短时间频繁重试）
 */
import { createBrowser, closeBrowser } from "./browser.js";

const MOBILE_API_BASE = "https://m.weibo.cn/api";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1";

// Cookie 续期冷却（防止频繁重试）
let _cookieLastRenewed = 0;
const COOKIE_RENEW_COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟冷却

/**
 * 微博 API 错误
 */
export class WeiboApiError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
    this.name = "WeiboApiError";
  }
}

/**
 * 移动端 API 请求头
 */
export function mobileHeaders(cookies?: string): Record<string, string> {
  return {
    "User-Agent": MOBILE_UA,
    "MWeibo-Pwa": "1",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://m.weibo.cn/",
    Accept: "application/json, text/plain, */*",
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

/**
 * 检查是否可以续期 cookie（冷却机制）
 */
function canRenewCookie(): boolean {
  return Date.now() - _cookieLastRenewed >= COOKIE_RENEW_COOLDOWN_MS;
}

/**
 * 通过 AgentBrowser 获取微博访客 cookie
 */
export async function fetchVisitorCookies(): Promise<string> {
  if (!canRenewCookie()) {
    const waitMs = COOKIE_RENEW_COOLDOWN_MS - (Date.now() - _cookieLastRenewed);
    throw new Error(`Cookie 续期冷却中，请 ${Math.ceil(waitMs / 1000)} 秒后再试`);
  }

  const browser = await createBrowser();
  try {
    await browser.ensureReady();
    const manager = await browser.getManagerForThread();
    const page = manager.getPage();
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "document" || type === "script" || type === "xhr" || type === "fetch") {
        route.continue();
      } else {
        route.abort();
      }
    });
    await page.goto("https://m.weibo.cn/", { waitUntil: "networkidle", timeout: 30_000 });
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    _cookieLastRenewed = Date.now();
    return cookieStr;
  } finally {
    await closeBrowser();
  }
}

/**
 * 调用微博移动端 API，支持 cookie 过期自动续期
 */
export async function weiboFetch<T>(
  apiPath: string,
  cookies?: string,
  maxRetries = 2,
): Promise<{ data: T; usedCookies: string }> {
  let currentCookies = cookies ?? "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const url = `${MOBILE_API_BASE}${apiPath}`;
      const res = await fetch(url, { headers: mobileHeaders(currentCookies) });

      if (!res.ok) {
        throw new Error(`微博 API ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as any;

      // ok === -100 表示 cookie 过期
      if (json.ok === -100) {
        throw new WeiboApiError(json.msg || "Cookie 过期", -100);
      }

      return { data: json as T, usedCookies: currentCookies };
    } catch (err) {
      if (err instanceof WeiboApiError && err.code === -100 && attempt < maxRetries - 1) {
        try {
          // 冷却期内不再重试，直接抛原错误
          currentCookies = await fetchVisitorCookies();
          lastError = err;
          continue;
        } catch (renewErr) {
          // 续期失败（包括冷却期被拒），不再重试
          throw renewErr;
        }
      }
      throw err;
    }
  }

  throw lastError || new Error("微博 API 请求失败");
}
