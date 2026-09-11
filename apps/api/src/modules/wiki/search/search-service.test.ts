import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
let db: { client: { execute: (sql: string) => Promise<unknown> } };

// 临时 WIKI_DIR + DATABASE_PATH，模块重置后重新加载（模拟独立运行环境）
async function loadSearch() {
  vi.resetModules();
  process.env["WIKI_DIR"] = dir;
  process.env["DATABASE_PATH"] = join(dir, "test.db");
  const dbMod = await import("@feedmind/db");
  db = dbMod as typeof db;
  const mod = await import("./search-service.js");
  return mod.searchWiki;
}

function writePage(relPath: string, title: string, body: string): void {
  const abs = join(dir, "sp-1", "wiki", relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `---\ntitle: ${title}\n---\n\n${body}`, "utf-8");
}

let search: Awaited<ReturnType<typeof loadSearch>>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "feedmind-search-"));
  writePage("ai-intro.md", "人工智能入门", "本文介绍机器学习与神经网络的基础概念。");
  writePage("recipes.md", "家常食谱", "番茄炒蛋与红烧肉的做法。");
  search = await loadSearch();
});

afterEach(() => {
  // Windows 下 sqlite 句柄释放可能有延迟，删除失败（EPERM）时交给系统临时目录清理
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录残留无害 */
  }
  vi.resetModules();
  delete process.env["WIKI_DIR"];
  delete process.env["DATABASE_PATH"];
});

describe("searchWiki", () => {
  it("短查询（<3 字符）直接走内存关键词搜索", async () => {
    const { results, mode } = await search("sp-1", "基础", 10);
    expect(mode).toBe("keyword");
    expect(results.map((r) => r.path)).toContain("ai-intro.md");
  });

  it("长查询走 FTS5 索引并命中页面", async () => {
    const { results, mode, totalHits } = await search("sp-1", "机器学习", 10);
    expect(mode).toBe("keyword");
    expect(totalHits).toBeGreaterThan(0);
    expect(results[0]?.path).toBe("ai-intro.md");
  });

  it("FTS5 损坏时回退内存搜索，不抛错", async () => {
    // 用同名普通表顶替 FTS 虚拟表：ensureFtsTables 不会覆盖，MATCH 语法必然失败
    await db.client.execute("DROP TABLE IF EXISTS wiki_fts");
    await db.client.execute("CREATE TABLE wiki_fts (x TEXT)");

    const { results, mode } = await search("sp-1", "神经网络", 10);
    expect(mode).toBe("keyword");
    expect(results.map((r) => r.path)).toContain("ai-intro.md");
  });

  it("空查询返回空结果", async () => {
    const { results, totalHits } = await search("sp-1", "   ", 10);
    expect(results).toHaveLength(0);
    expect(totalHits).toBe(0);
  });
});
