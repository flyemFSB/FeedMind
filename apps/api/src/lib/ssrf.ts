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

/** SSRF 防护：拒绝内网主机名与私网 IP 段。导出供测试与服务层直接验证。 */
export async function checkSSRF(urlStr: string): Promise<void> {
  const url = new URL(urlStr);
  const host = normalizeHost(url.hostname);
  if (INTERNAL_HOSTS.includes(host)) throw new Error(`SSRF blocked: ${host}`);
  if (PRIVATE_IPS.some((re) => re.test(host)))
    throw new Error(`SSRF blocked: private IP (${host})`);
}
