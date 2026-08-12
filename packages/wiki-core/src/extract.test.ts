import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractDocument } from "./extract.js";

// anydoc 二进制转换：验证真实转换输出与 ConvertError 码到中文警告的映射
describe("extractDocument (anydoc)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wiki-extract-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("csv 转为 markdown 表格", async () => {
    const file = join(dir, "data.csv");
    await writeFile(file, "name,age\nAlice,30\nBob,25");
    const doc = await extractDocument(file, "data.csv");
    expect(doc.text).toContain("Alice");
    expect(doc.warnings).toEqual([]);
    expect(doc.wordCount).toBeGreaterThan(0);
    expect(doc.mimeType).toBe("text/csv");
  });

  it("rtf 提取干净文本（不再直接读原始控制字）", async () => {
    const file = join(dir, "note.rtf");
    await writeFile(file, "{\\rtf1\\ansi Hello RTF world\\par}");
    const doc = await extractDocument(file, "note.rtf");
    expect(doc.text).toContain("Hello RTF world");
    expect(doc.warnings).toEqual([]);
  });

  it("未知格式映射为 unsupported 警告", async () => {
    const file = join(dir, "data.bin");
    await writeFile(file, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xde, 0xad]));
    const doc = await extractDocument(file, "data.bin");
    expect(doc.warnings[0]).toContain("不支持的格式");
    expect(doc.warnings[0]).toContain("unsupported");
    expect(doc.text).toContain("# data.bin");
  });

  it("md 文本分支不受影响", async () => {
    const file = join(dir, "note.md");
    await writeFile(file, "# 标题\n\n正文内容");
    const doc = await extractDocument(file, "note.md");
    expect(doc.text).toContain("正文内容");
    expect(doc.warnings).toEqual([]);
  });
});
