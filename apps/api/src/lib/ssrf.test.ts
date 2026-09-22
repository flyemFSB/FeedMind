import { describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { assertPublicUrl, checkSSRF, fetchExternal } from "./ssrf.js";

// DNS 解析必须 mock：真实解析会让用例依赖网络，也会让「解析到内网」这条防线无法稳定验证
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

// 锁定内网与私有 IP 黑名单边界，确保 SSRF 校验严格生效
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

  it("拒绝非 http(s) 协议", async () => {
    expect(await blocked("file:///etc/passwd")).toBe(true);
    expect(await blocked("ftp://example.com/x")).toBe(true);
    expect(await blocked("gopher://example.com/")).toBe(true);
  });
});

describe("assertPublicUrl（DNS 层）", () => {
  it("域名解析到内网地址时拒绝", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    await expect(assertPublicUrl("https://rebind.example/feed")).rejects.toThrow(/SSRF blocked/);
  });

  it("域名解析到公网地址时放行", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(assertPublicUrl("https://example.com/feed")).resolves.toBeUndefined();
  });
});

describe("fetchExternal（重定向）", () => {
  it("不跟随重定向到内网地址", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchExternal("https://example.com/feed")).rejects.toThrow(/SSRF blocked/);
    // 首跳放行后即被拦下，第二跳不允许发出
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
