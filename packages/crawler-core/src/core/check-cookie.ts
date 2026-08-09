/**
 * 平台登录 Cookie 校验。
 *
 * 刷新按钮 / 失效标记复用：bilibili、zhihu 走轻量 HTTP 接口，weread、xiaohongshu
 * 因接口必须在网页上下文请求，走 AgentBrowser。douyin 无可靠的轻量登录态接口，
 * 返回 null（不支持校验）。
 */
import { createBrowser, closeBrowser, ensureCookies, blockHeavyResources } from "./browser.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * 校验平台 Cookie 是否有效。
 * @returns true=有效 / false=失效 / null=该平台暂不支持校验
 */
export async function checkCookie(platform: string, cookies?: string): Promise<boolean | null> {
  switch (platform) {
    case "bilibili":
      return checkBilibili(cookies);
    case "zhihu":
      return checkZhihu(cookies);
    case "weread":
      return checkWeread(cookies);
    case "xiaohongshu":
      return checkXiaohongshu(cookies);
    default:
      return null;
  }
}

/** B站：nav 接口返回 isLogin，纯 HTTP，无需签名 */
async function checkBilibili(cookies?: string): Promise<boolean> {
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.bilibili.com",
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  // 仅 401 明确未登录；风控 412/429 等非 2xx 不代表 Cookie 失效，抛错让上层按"未知"处理
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`B站 nav 接口返回 ${res.status}`);
  const json = (await res.json()) as { data?: { isLogin?: boolean } };
  return json.data?.isLogin === true;
}

/** 知乎：/me 返回 url_token 即登录有效（公开接口，无签名） */
async function checkZhihu(cookies?: string): Promise<boolean> {
  const res = await fetch("https://www.zhihu.com/api/v4/me", {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.zhihu.com",
      "Accept-Language": "zh-CN,zh;q=0.9",
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`知乎 me 接口返回 ${res.status}`);
  const me = (await res.json()) as { url_token?: string };
  return Boolean(me.url_token);
}

/** 微信读书：首页上下文请求书架接口，无错误码即登录有效 */
async function checkWeread(cookies?: string): Promise<boolean> {
  const page = await createBrowser();
  try {
    await blockHeavyResources(page);

    await ensureCookies(page, cookies, "weread.qq.com");

    await page.goto("https://weread.qq.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const raw = await page
      .evaluate<string>(
        `(async function(){
        var res = await fetch('/web/shelf/sync?synckey=0&teenmode=0&album=1', { credentials: 'include' });
        var o = await res.json();
        return JSON.stringify({ ok: res.ok, errCode: o.errCode || 0 });
      })()`,
      )
      .catch(() => {
        // 页面加载/脚本执行失败：无法判定登录态，抛错让上层按"未知"处理，绝不当作有效
        throw new Error("微信读书页面校验失败");
      });
    const data = JSON.parse(raw) as { ok?: boolean; errCode?: number };
    // 仅 -2010（登录态失效）判失效；-2041（上下文错误）等业务码不代表 Cookie 失效
    return data.ok !== false && data.errCode !== -2010;
  } finally {
    await closeBrowser();
  }
}

/** 从 "a=1; b=2" 形式的 Cookie 串中提取指定名 */
function extractCookie(cookieStr: string | undefined, name: string): string | null {
  if (!cookieStr) return null;
  for (const part of cookieStr.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** 小红书：explore 首页 __INITIAL_STATE__.user.loggedIn 为 true 即登录有效 */
async function checkXiaohongshu(cookies?: string): Promise<boolean> {
  const page = await createBrowser();
  try {
    await blockHeavyResources(page);

    await ensureCookies(page, cookies, "xiaohongshu.com");

    await page.goto("https://www.xiaohongshu.com/explore", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const raw = await page
      .evaluate<string>(
        `(function(){
        var u = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
        if (!u) return "no-state";
        // 运行时 __INITIAL_STATE__ 被 Vue 响应式包裹，字段是 ref（_rawValue 存原始值）
        function unwrap(v) {
          return v && typeof v === "object" && "_rawValue" in v ? v._rawValue : v;
        }
        return JSON.stringify({ loggedIn: unwrap(u.loggedIn) });
      })()`,
      )
      .catch(() => {
        // 页面加载/脚本执行失败：无法判定登录态，抛错让上层按"未知"处理，绝不当作有效
        throw new Error("小红书页面校验失败");
      });
    if (raw === "no-state") throw new Error("小红书未获取到登录态状态");
    const data = JSON.parse(raw) as { loggedIn: boolean };
    return data.loggedIn === true;
  } finally {
    await closeBrowser();
  }
}

/**
 * 微信读书 Cookie 保活刷新。
 *
 * wr_skey 约 60-90 分钟过期，weread 网页版前端在页面加载时通过 XHR 刷新它。
 * 这里加载 weread.qq.com 触发续期，轮询 wr_skey 变化后校验书架接口，
 * 最后捕获刷新后的完整 Cookie 字符串返回（供写回 cookie_store）。
 */
export async function refreshWereadCookies(
  cookies?: string,
): Promise<{ valid: boolean; cookies?: string }> {
  const page = await createBrowser();
  try {
    await blockHeavyResources(page);

    await ensureCookies(page, cookies, "weread.qq.com");
    const oldSkey = extractCookie(cookies, "wr_skey");

    await page.goto("https://weread.qq.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    // 轮询 wr_skey 变化（最多 20s）：变化即前端已刷新；无变化则等固定时间兜底
    let refreshed = false;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const cc = await page.context().cookies(["https://weread.qq.com"]);
      const current = cc.find((c) => c.name === "wr_skey")?.value ?? null;
      if (current && current !== oldSkey) {
        refreshed = true;
        break;
      }
    }
    if (!refreshed) await page.waitForTimeout(3000);

    const raw = await page
      .evaluate<string>(
        `(async function(){
        var res = await fetch('/web/shelf/sync?synckey=0&teenmode=0&album=1', { credentials: 'include' });
        var o = await res.json();
        return JSON.stringify({ ok: res.ok, errCode: o.errCode || 0 });
      })()`,
      )
      .catch(() => {
        // 刷新失败（页面未加载/脚本未执行）：抛错中止，避免把旧 Cookie 当刷新结果写回
        throw new Error("微信读书页面刷新失败");
      });
    const data = JSON.parse(raw) as { ok?: boolean; errCode?: number };
    // 仅 -2010（登录态失效）判失效；-2041（上下文错误）等不代表 Cookie 失效
    if (data.ok === false || data.errCode === -2010) return { valid: false };

    // 含新 wr_skey
    const cc = await page.context().cookies(["https://weread.qq.com"]);
    const newCookies = cc
      .filter((c) => c.name && c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    return { valid: true, cookies: newCookies };
  } finally {
    await closeBrowser();
  }
}
