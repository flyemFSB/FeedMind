import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** 私网 IP 段正则列表（SSRF 防护） */
const PRIVATE_IPS = [
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // 云厂商元数据与链路本地 (AWS/GCP/Azure 169.254.169.254)
  /^0\.\d+\.\d+\.\d+$/,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT 共享地址空间
  /^::1$/,
  // IPv6 按网段前缀：ULA 为 fc00::/7（fc00-fdff），链路本地为 fe80::/10（fe80-febf）
  /^f[cd][0-9a-f]{2}:/,
  /^fe[89ab][0-9a-f]:/,
];

const INTERNAL_HOSTS = [
  "localhost",
  "localhost.localdomain",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "internal",
];

/** 归一化 Host：去除方括号，并将 IPv4 映射的 IPv6 (::ffff:x) 转换为标准 IPv4 字符串 */
function normalizeHost(rawHost: string): string {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.startsWith("::ffff:")) {
    const rest = host.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) {
      return rest;
    }
    const parts = rest.split(":");
    if (parts.length === 2) {
      const high = Number.parseInt(parts[0] ?? "", 16);
      const low = Number.parseInt(parts[1] ?? "", 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const b1 = (high >> 8) & 0xff;
        const b2 = high & 0xff;
        const b3 = (low >> 8) & 0xff;
        const b4 = low & 0xff;
        return `${b1}.${b2}.${b3}.${b4}`;
      }
    }
  }
  return host;
}

/** SSRF 防护：限制协议，并拒绝内网主机名与私网 IP 字面量（纯字符串判定，不做 DNS） */
export async function checkSSRF(urlStr: string): Promise<void> {
  const url = new URL(urlStr);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SSRF blocked: 不允许的协议 (${url.protocol})`);
  }
  const host = normalizeHost(url.hostname);
  if (INTERNAL_HOSTS.includes(host)) throw new Error(`SSRF blocked: ${host}`);
  if (PRIVATE_IPS.some((re) => re.test(host)))
    throw new Error(`SSRF blocked: private IP (${host})`);
}

/** 断言目标为公网地址：字面量校验通过后再解析域名，逐 IP 复检（防域名指向内网） */
export async function assertPublicUrl(urlStr: string): Promise<void> {
  await checkSSRF(urlStr);
  const host = normalizeHost(new URL(urlStr).hostname);
  if (isIP(host) !== 0) return;
  const records = await lookup(host, { all: true });
  for (const { address } of records) {
    if (PRIVATE_IPS.some((re) => re.test(normalizeHost(address)))) {
      throw new Error(`SSRF blocked: ${host} 解析到内网地址 (${address})`);
    }
  }
}

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

/** 抓取外部 URL：不自动跟随重定向，每一跳都重新做公网校验 */
export async function fetchExternal(url: string, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(target);
    const res = await fetch(target, { ...init, signal, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      target = new URL(location, target).toString();
      continue;
    }
    return res;
  }
  throw new Error(`重定向次数超过 ${MAX_REDIRECTS} 次: ${url}`);
}
