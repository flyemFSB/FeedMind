import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

// WIKI_DIR 指向独立临时目录；每次重新加载模块，模拟全新环境
async function loadSourceStore() {
  vi.resetModules();
  process.env["WIKI_DIR"] = dir;
  const mod = await import("./source-store.js");
  return mod;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "feedmind-source-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.resetModules();
  delete process.env["WIKI_DIR"];
});

describe("saveUploadedSource", () => {
  it("二进制 PDF 上传返回 queued：上传路由据此走转换任务，而非直接导入", async () => {
    // 回归：readUploadedSource 曾硬编码 ready，导致 PDF 绕过转换、LLM 基于空正文脑补概念
    const { saveUploadedSource } = await loadSourceStore();
    const src = await saveUploadedSource(
      "sp-1",
      "测试文档.pdf",
      new TextEncoder().encode("%PDF-1.4 fake"),
    );
    expect(src.status).toBe("queued");
    expect(src.mime_type).toBe("application/octet-stream");
    // 用户上传文件落 raw/uploads，供来源管理展示；转换 md 留 raw/sources
    expect(src.storage_path).toBe("raw/uploads/测试文档.pdf");
    const uploadsPath = join(dir, "sp-1", "raw", "uploads", "测试文档.pdf");
    const sourcesPath = join(dir, "sp-1", "raw", "sources", "测试文档.md");
    expect(existsSync(uploadsPath)).toBe(true);
    expect(existsSync(sourcesPath)).toBe(true);
  });

  it("文本文件上传返回 ready，原文落 uploads", async () => {
    const { saveUploadedSource } = await loadSourceStore();
    const src = await saveUploadedSource("sp-1", "note.txt", new TextEncoder().encode("hello"));
    expect(src.status).toBe("ready");
    expect(src.storage_path).toBe("raw/uploads/note.txt");
  });
});

describe("deleteWikiSource & previewDeleteImpact", () => {
  it("删除 PDF 上传来源时，能正确识别并删除引用其转换 md 的孤立 Wiki 概念页面", async () => {
    const { saveUploadedSource, previewDeleteImpact, deleteWikiSource } = await loadSourceStore();
    await saveUploadedSource("sp-1", "地层元素.pdf", new TextEncoder().encode("%PDF-1.4"));

    const wikiDir = join(dir, "sp-1", "wiki");
    mkdirSync(wikiDir, { recursive: true });
    const conceptPath = join(wikiDir, "concept-a.md");
    // 导入管道生成的 Concept 页面，sources 记录的是转换 md 标识
    writeFileSync(
      conceptPath,
      `---
type: Concept
title: 概念A
sources:
  - id: src
    resource: 地层元素.md
---
正文内容`,
      "utf-8",
    );

    // 1. 预览影响
    const preview = await previewDeleteImpact("sp-1", "地层元素");
    expect(preview.willDelete).toHaveLength(1);
    expect(preview.willDelete[0]).toContain("concept-a.md");

    // 2. 执行孤立删除
    const result = await deleteWikiSource("sp-1", "地层元素", "delete-orphans");
    expect(result.deleted_pages).toBe(1);
    expect(existsSync(conceptPath)).toBe(false);
    expect(existsSync(join(dir, "sp-1", "raw", "uploads", "地层元素.pdf"))).toBe(false);
    expect(existsSync(join(dir, "sp-1", "raw", "sources", "地层元素.md"))).toBe(false);
  });

  it("多来源引用的 Wiki 页面在删除其中一个来源时仅更新 sources 不删除页面", async () => {
    const { saveUploadedSource, deleteWikiSource } = await loadSourceStore();
    await saveUploadedSource("sp-1", "src1.txt", new TextEncoder().encode("1"));
    await saveUploadedSource("sp-1", "src2.txt", new TextEncoder().encode("2"));

    const wikiDir = join(dir, "sp-1", "wiki");
    mkdirSync(wikiDir, { recursive: true });
    const conceptPath = join(wikiDir, "concept-b.md");
    writeFileSync(
      conceptPath,
      `---
type: Concept
title: 概念B
sources:
  - resource: src1.md
  - resource: src2.md
---
正文内容`,
      "utf-8",
    );

    const result = await deleteWikiSource("sp-1", "src1", "delete-orphans");
    expect(result.deleted_pages).toBe(0);
    expect(result.updated_pages).toBe(1);
    expect(existsSync(conceptPath)).toBe(true);

    const updated = readFileSync(conceptPath, "utf-8");
    expect(updated).toContain("src2.md");
    expect(updated).not.toContain("src1.md");
  });

  it("来源文件已被删除时，重复删除保持幂等安全（不抛 500 异常）", async () => {
    const { saveUploadedSource, deleteWikiSource } = await loadSourceStore();
    await saveUploadedSource("sp-1", "note.txt", new TextEncoder().encode("hello"));

    // 首次删除
    await deleteWikiSource("sp-1", "note", "delete-orphans");

    // 再次删除同一个已不存在的来源应抛出 404 而非 500
    await expect(deleteWikiSource("sp-1", "note", "delete-orphans")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("同名文件或同名来源重复上传/创建时，拦截并抛出 409", async () => {
    const { saveUploadedSource, createWikiSource } = await loadSourceStore();
    const pdfBytes = new TextEncoder().encode("%PDF-1.4 sample content");

    // 1. 首次上传 PDF 成功
    await saveUploadedSource("sp-1", "doc1.pdf", pdfBytes);

    // 2. 再次上传同名文件，判定为同名重复并抛出 409
    await expect(saveUploadedSource("sp-1", "doc1.pdf", pdfBytes)).rejects.toMatchObject({
      status: 409,
    });

    // 3. 文本文件同名判重
    await saveUploadedSource("sp-1", "note.txt", new TextEncoder().encode("hello"));
    await expect(
      saveUploadedSource("sp-1", "note.txt", new TextEncoder().encode("different")),
    ).rejects.toMatchObject({
      status: 409,
    });

    // 4. createWikiSource 同名判重
    await expect(
      createWikiSource("sp-1", {
        kind: "text",
        title: "doc1",
        content: "some text",
        metadata: {},
      }),
    ).rejects.toMatchObject({
      status: 409,
    });

    // 5. 不同空间同名文件互不干扰
    const sp2Result = await saveUploadedSource("sp-2", "doc1.pdf", pdfBytes);
    expect(sp2Result.id).toBe("doc1");
  });
});
