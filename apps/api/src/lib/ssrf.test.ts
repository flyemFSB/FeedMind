import { describe, expect, it } from "vitest";
import { checkSSRF } from "./ssrf.js";

// AGENTS 安全规范：抓取类工具必须拒绝内网/私有 IP。这些用例锁住黑名单边界，
// 防止后续「顺手放行」把 SSRF 面重新打开。
async function blocked(url: string): Promise<boolean> {
  try {
    await checkSSRF(url);
    return false;
  } catch {
    return true;
  }
}

describe("checkSSRF", () => {
  it("放行公网 IPv4 与常见 https URL", async () => {
    expect(await blocked("https://example.com/feed")).toBe(false);
    expect(await blocked("http://8.8.8.8/")).toBe(false);
    expect(await blocked("https://1.1.1.1/path?q=1")).toBe(false);
  });

  it("拒绝 loopback 与 0.0.0.0", async () => {
    expect(await blocked("http://127.0.0.1/")).toBe(true);
    expect(await blocked("http://127.1.2.3/admin")).toBe(true);
    expect(await blocked("http://0.0.0.0/")).toBe(true);
    expect(await blocked("http://localhost/")).toBe(true);
    expect(await blocked("http://localhost.localdomain/")).toBe(true);
  });

  it("拒绝 RFC1918 私网段", async () => {
    expect(await blocked("http://10.0.0.1/")).toBe(true);
    expect(await blocked("http://172.16.0.1/")).toBe(true);
    expect(await blocked("http://172.31.255.255/")).toBe(true);
    expect(await blocked("http://192.168.1.1/")).toBe(true);
    // 172.15 / 172.32 不在 172.16/12 内，应放行
    expect(await blocked("http://172.15.0.1/")).toBe(false);
    expect(await blocked("http://172.32.0.1/")).toBe(false);
  });

  it("拒绝云元数据与链路本地 169.254", async () => {
    expect(await blocked("http://169.254.169.254/latest/meta-data/")).toBe(true);
    expect(await blocked("http://169.254.0.1/")).toBe(true);
  });

  it("拒绝 CGNAT 100.64/10", async () => {
    expect(await blocked("http://100.64.0.1/")).toBe(true);
    expect(await blocked("http://100.127.255.255/")).toBe(true);
    expect(await blocked("http://100.128.0.1/")).toBe(false);
  });

  it("拒绝 IPv6 loopback / ULA / 链路本地，并识别 IPv4 映射地址", async () => {
    expect(await blocked("http://[::1]/")).toBe(true);
    expect(await blocked("http://[fc00::1]/")).toBe(true);
    expect(await blocked("http://[fd12:3456::1]/")).toBe(true);
    expect(await blocked("http://[fe80::1]/")).toBe(true);
    expect(await blocked("http://[::ffff:127.0.0.1]/")).toBe(true);
    expect(await blocked("http://[::ffff:192.168.0.1]/")).toBe(true);
  });

  it("拒绝 internal 保留主机名", async () => {
    expect(await blocked("http://internal/")).toBe(true);
  });
});
