import { describe, expect, it } from "vitest";
import { checkSSRF } from "./web-fetch.js";

// SSRF 防护是信任边界（AGENTS.md 安全规范）：抓取类工具必须拒绝内网/私有 IP 段。
// 正则漏写一段 = 内网探测入口，故逐段验证拒绝清单与公网放行。
describe("checkSSRF", () => {
  it("拒绝 localhost 与常见回环别名", async () => {
    await expect(checkSSRF("http://localhost:8080/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://127.0.0.1/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://0.0.0.0/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://[::1]/")).rejects.toThrow("SSRF blocked");
  });

  it("拒绝各私网 IP 段（含 172.16-31 边界）", async () => {
    await expect(checkSSRF("http://10.0.0.1/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://172.16.0.1/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://172.31.255.255/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://192.168.1.1/")).rejects.toThrow("SSRF blocked");
  });

  it("拒绝 IPv6 私网/链路本地段", async () => {
    await expect(checkSSRF("http://[fc00::1]/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://[fd12:3456::1]/")).rejects.toThrow("SSRF blocked");
    await expect(checkSSRF("http://[fe80::1]/")).rejects.toThrow("SSRF blocked");
  });

  it("公网域名与公网 IP 放行", async () => {
    await expect(checkSSRF("https://example.com/article")).resolves.toBeUndefined();
    await expect(checkSSRF("https://8.8.8.8/")).resolves.toBeUndefined();
  });
});
