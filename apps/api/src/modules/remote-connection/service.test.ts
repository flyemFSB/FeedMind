import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { RemoteConnectionRow } from "@feedmind/db";
import { createTestDb, type TestDbContext } from "../../test-utils.js";

// 焦点：连接配置的加密落库与 upsert/状态机语义
async function loadService() {
  return import("./service.js");
}
type ServiceModule = Awaited<ReturnType<typeof loadService>>;

process.env["ENCRYPTION_KEY"] ??= "test-encryption-key-not-secret";

let ctx: TestDbContext;
let service: ServiceModule;

beforeEach(async () => {
  vi.resetModules();
  ctx = await createTestDb({ seedDefaults: false });
  service = await loadService();
});

afterEach(async () => {
  await ctx.cleanup();
});

const rawRow = async (id: string): Promise<RemoteConnectionRow | undefined> => {
  const [row] = await ctx.dbMod.db
    .select()
    .from(ctx.dbMod.remoteConnections)
    .where(eq(ctx.dbMod.remoteConnections.id, id));
  return row;
};

describe("连接配置加解密", () => {
  it("加密后落库，明文不出现在 DB 列中", async () => {
    const config = { appId: "cli_abc", appSecret: "super-secret-value" };

    const created = await service.upsertConnection("feishu", {
      platform: "feishu",
      label: "飞书",
      config,
    });

    expect(created.config).toEqual(config);
    const stored = await rawRow(created.id);
    expect(stored?.config).toBeTruthy();
    expect(stored?.config).not.toContain("super-secret-value");
    expect(stored?.config).not.toContain("cli_abc");
  });

  it("解密失败时按未加密 JSON 回退解析", () => {
    expect(service.decryptConfigField(JSON.stringify({ token: "plain" }))).toEqual({
      token: "plain",
    });
    expect(service.decryptConfigField("not-json")).toBeNull();
    expect(service.decryptConfigField(null)).toBeNull();
  });
});

describe("upsertConnection", () => {
  it("首次写入状态为 disconnected 并返回可解密的配置", async () => {
    const created = await service.upsertConnection("xiaohongshu", {
      platform: "xiaohongshu",
      label: "小红书",
      config: { cookie: "a=1" },
    });

    expect(created.status).toBe("disconnected");
    expect(created.label).toBe("小红书");
    expect(created.config).toEqual({ cookie: "a=1" });
  });

  it("同平台重复写入时更新既有行而不是新增", async () => {
    const first = await service.upsertConnection("douyin", {
      platform: "douyin",
      label: "旧",
      config: { a: 1 },
    });
    const second = await service.upsertConnection("douyin", {
      platform: "douyin",
      label: "新",
      config: { b: 2 },
    });

    expect(second.id).toBe(first.id);
    expect(second.label).toBe("新");
    expect(second.config).toEqual({ b: 2 });

    const rows = await ctx.dbMod.db.select().from(ctx.dbMod.remoteConnections);
    expect(rows).toHaveLength(1);
  });

  it("未提供 config 时保留既有密文", async () => {
    const first = await service.upsertConnection("zhihu", {
      platform: "zhihu",
      label: "知乎",
      config: { c: 3 },
    });
    const second = await service.upsertConnection("zhihu", { platform: "zhihu", label: "知乎改" });

    expect(second.config).toEqual({ c: 3 });
    expect(second.label).toBe("知乎改");
    expect(second.id).toBe(first.id);
  });
});

describe("查询与删除", () => {
  it("按平台查询返回对应记录，缺失返回 null", async () => {
    const created = await service.upsertConnection("weread", {
      platform: "weread",
      label: "微信读书",
    });

    expect((await service.getConnectionByPlatform("weread"))?.id).toBe(created.id);
    expect(await service.getConnectionByPlatform("feishu")).toBeNull();
  });

  it("按 id 查询不存在时抛 404 NOT_FOUND", async () => {
    await expect(service.getConnection("missing-id")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("删除后记录消失，且按平台查询回到 null", async () => {
    const created = await service.upsertConnection("feishu", { platform: "feishu", label: "飞书" });

    await service.deleteConnection(created.id);

    expect(await service.getConnectionByPlatform("feishu")).toBeNull();
  });

  it("删除不存在的记录抛 404", async () => {
    await expect(service.deleteConnection("missing-id")).rejects.toMatchObject({ status: 404 });
  });
});

describe("updateConnectionStatus", () => {
  it("写入状态与错误信息，未传 extra 时保留既有值", async () => {
    const created = await service.upsertConnection("feishu", { platform: "feishu", label: "飞书" });
    await service.updateConnectionStatus(created.id, "connected", { tenant: "t1" });

    await service.updateConnectionStatus(created.id, "error", undefined, "凭据已过期");

    const row = await rawRow(created.id);
    expect(row?.status).toBe("error");
    expect(row?.error).toBe("凭据已过期");
    expect(row?.extra).toBe(JSON.stringify({ tenant: "t1" }));
  });

  it("状态切回 connected 时清空上一次的错误信息", async () => {
    const created = await service.upsertConnection("feishu", { platform: "feishu", label: "飞书" });
    await service.updateConnectionStatus(created.id, "error", undefined, "网络异常");

    await service.updateConnectionStatus(created.id, "connected");

    const row = await rawRow(created.id);
    expect(row?.error).toBeNull();
  });
});

describe("listConnections", () => {
  it("按平台筛选与不筛选均返回已建记录", async () => {
    await service.upsertConnection("feishu", { platform: "feishu", label: "飞书" });
    await service.upsertConnection("weread", { platform: "weread", label: "微信读书" });

    expect((await service.listConnections()).map((c) => c.platform).sort()).toEqual([
      "feishu",
      "weread",
    ]);
    expect((await service.listConnections("weread")).map((c) => c.platform)).toEqual(["weread"]);
  });
});
