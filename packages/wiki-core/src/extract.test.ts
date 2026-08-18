import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractDocument } from "./extract.js";

// 最小单页 PDF（含 xref 表）fixture 生成器：startxref 偏移随内容自动计算
export function buildMinimalPdf(): string {
  const streamBody = "BT /F1 24 Tf 72 720 Td (Hello World) Tj ET";
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${Buffer.byteLength(streamBody)}>>stream\n${streamBody}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, body] of objs.entries()) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return out;
}

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

  it("未知格式映射为 unsupported 错误（不再返回占位文本）", async () => {
    const file = join(dir, "data.bin");
    await writeFile(file, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xde, 0xad]));
    await expect(extractDocument(file, "data.bin")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("损坏 PDF 直接抛 malformed 错误（失败绝不产生占位正文）", async () => {
    const file = join(dir, "broken.pdf");
    await writeFile(file, `%PDF-1.7\n${"x".repeat(500)}`);
    await expect(extractDocument(file, "broken.pdf")).rejects.toMatchObject({ code: "malformed" });
  });

  it("PDF 提取文本并返回页数（unpdf 接管 PDF 分支）", async () => {
    const file = join(dir, "hello.pdf");
    await writeFile(file, buildMinimalPdf(), "latin1");
    const doc = await extractDocument(file, "hello.pdf");
    expect(doc.text).toContain("Hello World");
    expect(doc.pageCount).toBe(1);
    expect(doc.mimeType).toBe("application/pdf");
  });

  it("startxref off-by-one 的 PDF（用户报错场景，anydoc 拒绝）unpdf 正常提取", async () => {
    const file = join(dir, "offby1.pdf");
    const m = /startxref\n(\d+)/.exec(buildMinimalPdf())!;
    const broken = buildMinimalPdf().replace(/startxref\n\d+/, `startxref\n${Number(m[1]) - 1}`);
    await writeFile(file, broken, "latin1");
    const doc = await extractDocument(file, "offby1.pdf");
    expect(doc.text).toContain("Hello World");
  });

  it("%%EOF 后填充字节的 PDF（anydoc#59 Case A）unpdf 正常提取", async () => {
    const file = join(dir, "padded.pdf");
    await writeFile(
      file,
      Buffer.concat([Buffer.from(buildMinimalPdf(), "latin1"), Buffer.alloc(600)]),
    );
    const doc = await extractDocument(file, "padded.pdf");
    expect(doc.text).toContain("Hello World");
  });

  it("md 文本分支不受影响", async () => {
    const file = join(dir, "note.md");
    await writeFile(file, "# 标题\n\n正文内容");
    const doc = await extractDocument(file, "note.md");
    expect(doc.text).toContain("正文内容");
    expect(doc.warnings).toEqual([]);
  });
});
