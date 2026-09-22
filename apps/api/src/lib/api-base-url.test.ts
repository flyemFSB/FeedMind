import { afterEach, describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./api-base-url.js";

const original = process.env["API_PORT"];

afterEach(() => {
  if (original === undefined) delete process.env["API_PORT"];
  else process.env["API_PORT"] = original;
});

describe("resolveApiBaseUrl", () => {
  it("端口在启动期被切换后仍返回实际监听端口", () => {
    process.env["API_PORT"] = "18790";
    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:18790");

    // 模拟启动自检回退到空闲端口：固化值必须失效
    process.env["API_PORT"] = "52341";
    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:52341");
  });
});
