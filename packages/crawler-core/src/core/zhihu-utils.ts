/**
 * 知乎辅助工具
 *
 * 处理知乎 API 的认证和请求头生成：
 * - x-zse-96 加密头生成
 * - d_c0 cookie 提取
 * - __zse_ck 自动获取
 */
import crypto from "node:crypto";
import { encrypt } from "./x-zse-96-v3.js";

const API_BASE = "https://www.zhihu.com/api/v4";

/**
 * 从 cookie 字符串中提取指定 key 的值
 */
function getCookieValue(cookies: string, key: string): string | null {
  for (const part of cookies.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(key + "=")) {
      return trimmed.slice(key.length + 1);
    }
  }
  return null;
}

/**
 * 获取 __zse_ck 值（从知乎静态 JS 文件自动获取）
 */
async function fetchZseCK(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("https://static.zhihu.com/zse-ck/v3.js", { signal });
    const script = await res.text();
    const match = script.match(/__g\.ck\|\|"([\w+/=\\]*)",_=/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * 构建 x-zse-96 加密头
 *
 * 算法：
 * 1. f = "101_3_3.0" + apiPath + d_c0
 * 2. md5 = MD5(f)
 * 3. x-zse-96 = "2.0_" + encrypt(md5)
 */
function buildXZSE96(apiPath: string, dc0: string): string {
  const f = `101_3_3.0+${apiPath}+${dc0}`;
  const md5Str = crypto.createHash("md5").update(f, "utf-8").digest("hex");
  return "2.0_" + encrypt(md5Str);
}

/**
 * 构建完整的知乎 API 请求头
 */
async function buildZhihuHeaders(
  apiPath: string,
  cookies?: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  let dc0 = cookies ? getCookieValue(cookies, "d_c0") : null;
  let zseCk = cookies ? getCookieValue(cookies, "__zse_ck") : null;
  let cookieStr = cookies ?? "";

  // 如果没有 d_c0，尝试自动获取
  if (!dc0) {
    // 先获取 zse_ck
    zseCk ??= await fetchZseCK(signal);
    if (zseCk) {
      cookieStr = `__zse_ck=${zseCk}`;
    }
    // 访问首页获取 d_c0
    const homeRes = await fetch("https://www.zhihu.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal,
    });
    const setCookies = homeRes.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      if (sc.startsWith("d_c0=")) {
        dc0 = sc.split(";", 1)[0].slice("d_c0=".length);
        break;
      }
    }
  }

  // 如果没有 __zse_ck，自动获取
  if (!zseCk) {
    zseCk = await fetchZseCK(signal);
    if (zseCk && dc0) {
      cookieStr = `d_c0=${dc0}; __zse_ck=${zseCk}`;
    }
  }

  const xzse96 = dc0 ? buildXZSE96(apiPath, dc0) : "";

  return {
    Cookie: cookieStr,
    "x-zse-96": xzse96,
    "x-zse-93": "101_3_3.0",
    "x-app-za": "OS=Web",
    "x-api-version": "3.0.91",
    "x-requested-with": "fetch",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Referer: "https://www.zhihu.com",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
}

/**
 * 调用知乎 API（自动处理认证头）
 */
export async function zhihuFetch<T>(
  apiPath: string,
  cookies?: string,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await buildZhihuHeaders(apiPath, cookies, signal);
  const fullUrl = apiPath.startsWith("http") ? apiPath : `${API_BASE}${apiPath}`;

  const res = await fetch(fullUrl, { headers, signal });
  if (!res.ok) throw new Error(`知乎 API ${res.status}: ${res.statusText}`);

  return res.json() as Promise<T>;
}
