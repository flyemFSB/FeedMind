import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDbContext } from "../../../test-utils.js";

// 概念页是 OKF bundle 的读写边界：文件系统与 FTS 索引必须保持一致
async function loadStore() {
  return import("./page-store.js");
}
type StoreModule = Awaited<ReturnType<typeof loadStore>>;

let ctx: TestDbContext;
let store: StoreModule;
let dir: string;

const SPACE = "sp-1";

function makePage(pagePath: string, title: string, content = "正文内容") {
  return {
    path: pagePath,
    type: "Technology",
    title,
    content,
    tags: [] as string[],
    frontmatter: {} as Record<string, unknown>,
  };
}

beforeEach(async () => {
  vi.resetModules();
  dir = mkdtempSync(join(tmpdir(), "feedmind-page-store-"));
  process.env["DATA_DIR"] = dir;
  delete process.env["WIKI_DIR"];

  ctx = await createTestDb({ seedDefaults: false });
  const { createSpaceDirs } = await import("../space-fs/index.js");
  createSpaceDirs(SPACE);
  store = await loadStore();
});

afterEach(async () => {
  await ctx.cleanup();
  delete process.env["DATA_DIR"];
  // Windows 下 sqlite 句柄释放可能有延迟，删除失败时交给系统临时目录清理
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录残留无害 */
  }
});

describe("createWikiPage", () => {
  it("写入后可原样读回，Concept ID 即相对路径", async () => {
    const created = await store.createWikiPage(SPACE, makePage("concepts/rag.md", "检索增强生成"));

    expect(created.title).toBe("检索增强生成");
    expect(created.type).toBe("Technology");
    expect(created.content).toContain("正文内容");

    const read = await store.getWikiPage(SPACE, created.concept_id);
    expect(read.title).toBe("检索增强生成");
  });

  it("路径已存在时抛 409 而不是覆盖", async () => {
    await store.createWikiPage(SPACE, makePage("concepts/dup.md", "首个"));

    await expect(
      store.createWikiPage(SPACE, makePage("concepts/dup.md", "后来者")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("非法 Concept 路径被拒绝", async () => {
    await expect(store.createWikiPage(SPACE, makePage("../escape.md", "越界"))).rejects.toThrow();
  });
});

describe("getWikiPage / deleteWikiPage", () => {
  it("读取不存在的页面抛 404", async () => {
    await expect(store.getWikiPage(SPACE, "concepts/missing.md")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("删除后读取回到 404，重复删除同样抛 404", async () => {
    const created = await store.createWikiPage(SPACE, makePage("concepts/gone.md", "待删除"));

    await store.deleteWikiPage(SPACE, created.concept_id);

    await expect(store.getWikiPage(SPACE, created.concept_id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(store.deleteWikiPage(SPACE, created.concept_id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("listWikiPages", () => {
  beforeEach(async () => {
    await store.createWikiPage(SPACE, {
      ...makePage("concepts/alpha.md", "神经网络"),
      type: "Technology",
    });
    await store.createWikiPage(SPACE, {
      ...makePage("concepts/beta.md", "家常食谱"),
      type: "Reference",
    });
  });

  it("按 type 过滤", async () => {
    const { items, total } = await store.listWikiPages(SPACE, { type: "Reference" });
    expect(total).toBe(1);
    expect(items.map((i) => i.title)).toEqual(["家常食谱"]);
  });

  it("按标题关键字过滤", async () => {
    const { items, total } = await store.listWikiPages(SPACE, { q: "神经" });
    expect(total).toBe(1);
    expect(items[0]?.title).toBe("神经网络");
  });

  it("total 是过滤后的总数，分页只影响 items", async () => {
    const { items, total } = await store.listWikiPages(SPACE, { limit: 1, offset: 0 });
    expect(total).toBe(2);
    expect(items).toHaveLength(1);
  });
});

describe("updateWikiPage", () => {
  it("更新标题与正文，其他字段保留", async () => {
    const created = await store.createWikiPage(SPACE, {
      ...makePage("concepts/edit.md", "旧标题", "旧正文"),
      tags: ["tag-a"],
    });

    const updated = await store.updateWikiPage(SPACE, created.concept_id, {
      title: "新标题",
      content: "新正文",
    });

    expect(updated.title).toBe("新标题");
    expect(updated.content).toContain("新正文");
    expect(updated.type).toBe("Technology");
    expect(updated.tags).toEqual(["tag-a"]);
  });

  it("改名路径后旧路径失效、新路径可读", async () => {
    const created = await store.createWikiPage(SPACE, makePage("concepts/old.md", "待改名"));

    const updated = await store.updateWikiPage(SPACE, created.concept_id, {
      path: "concepts/new.md",
    });

    expect(updated.path).toBe("concepts/new.md");
    await expect(store.getWikiPage(SPACE, "concepts/old.md")).rejects.toMatchObject({
      status: 404,
    });
    expect((await store.getWikiPage(SPACE, "concepts/new.md")).title).toBe("待改名");
  });

  it("改到已存在的路径抛 409 且不改动原页面", async () => {
    const first = await store.createWikiPage(SPACE, makePage("concepts/keep.md", "保留"));
    await store.createWikiPage(SPACE, makePage("concepts/taken.md", "已占用"));

    await expect(
      store.updateWikiPage(SPACE, first.concept_id, { path: "concepts/taken.md" }),
    ).rejects.toMatchObject({ status: 409 });

    expect((await store.getWikiPage(SPACE, "concepts/keep.md")).title).toBe("保留");
  });

  it("更新不存在的页面抛 404", async () => {
    await expect(
      store.updateWikiPage(SPACE, "concepts/missing.md", { title: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
