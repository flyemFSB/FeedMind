import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  apiPortCheck,
  cdpPortCheck,
  detectForeignCdpOwner,
  encryptionKeyCheck,
  probeFreePort,
  runStartupChecks,
  type StartupCheck,
} from "./startup-checks.js";

const servers: Server[] = [];
const envBackup = {
  API_PORT: process.env["API_PORT"],
  CDP_PORT: process.env["CDP_PORT"],
};

/** 起一个临时 HTTP 服务并返回其端口 */
function listenHttp(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address && typeof address === "object" ? address.port : 0);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("probeFreePort", () => {
  it("空闲端口原样返回，被占用返回 null", async () => {
    const busy = await listenHttp((_req, res) => res.end());
    expect(await probeFreePort(busy)).toBeNull();
    expect(await probeFreePort(0)).toBeGreaterThan(0);
  });
});

describe("apiPortCheck", () => {
  it("端口空闲时通过且不改动配置", async () => {
    const free = await probeFreePort(0);
    process.env["API_PORT"] = String(free);
    const finding = await apiPortCheck.run();
    expect(finding.level).toBe("ok");
    expect(process.env["API_PORT"]).toBe(String(free));
  });

  it("端口被占用时自动回退到空闲端口（对用户无感，仅需落日志）", async () => {
    const busy = await listenHttp((_req, res) => res.end());
    process.env["API_PORT"] = String(busy);
    const finding = await apiPortCheck.run();
    expect(finding.level).toBe("ok");
    expect(finding.message).toContain(String(busy));
    const fallback = Number(process.env["API_PORT"]);
    expect(fallback).not.toBe(busy);
    expect(fallback).toBeGreaterThan(0);
  });
});

describe("detectForeignCdpOwner", () => {
  it("本应用占用（UA 与 Electron 版本一致）不告警", () => {
    expect(
      detectForeignCdpOwner(
        { "User-Agent": "Mozilla/5.0 Electron/44.1.1 Chrome/140.0.0.0" },
        "44.1.1",
      ),
    ).toBeNull();
  });

  it("外部浏览器或其它 Electron 应用占用时告警", () => {
    expect(
      detectForeignCdpOwner(
        { "User-Agent": "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36" },
        "44.1.1",
      ),
    ).toMatch(/其它浏览器占用/);
    expect(
      detectForeignCdpOwner(
        { "User-Agent": "Mozilla/5.0 Electron/30.0.0 Chrome/124.0.0.0" },
        "44.1.1",
      ),
    ).toMatch(/其它 Electron 应用占用/);
    expect(detectForeignCdpOwner({}, "44.1.1")).toMatch(/无法识别/);
  });
});

describe("cdpPortCheck", () => {
  it("系统自动分配端口时无需探测", async () => {
    expect((await cdpPortCheck(0).run()).level).toBe("ok");
  });

  it("端口空闲（本机 Chromium 尚未绑定）视为正常", async () => {
    expect((await cdpPortCheck(1).run()).level).toBe("ok");
  });

  it("显式端口被外部浏览器占用时汇报降级，并提示改回自动分配", async () => {
    const port = await listenHttp((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ "User-Agent": "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36" }));
    });
    const finding = await cdpPortCheck(port).run();
    expect(finding.level).toBe("degraded");
    expect(finding.message).toMatch(/其它浏览器占用/);
    expect(finding.message).toMatch(/系统自动分配/);
  });
});

describe("runStartupChecks", () => {
  it("汇总全部检查结果，检查自身异常按致命处理", async () => {
    const checks: StartupCheck[] = [
      { name: "甲", run: () => ({ level: "ok", message: "通过" }) },
      { name: "乙", run: () => ({ level: "degraded", message: "降级" }) },
      {
        name: "丙",
        run: () => {
          throw new Error("探测失败");
        },
      },
    ];
    const findings = await runStartupChecks([...checks, encryptionKeyCheck("主密钥已变更")]);
    expect(findings.map((f) => f.name)).toEqual(["甲", "乙", "丙", "主密钥"]);
    expect(findings.filter((f) => f.level === "degraded")).toHaveLength(2);
    expect(findings.find((f) => f.name === "丙")?.message).toBe("探测失败");
  });
});
