import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePdfWithVl, VlParserError } from "./vl-parser.js";
import { extractDocument } from "./extract.js";

// PaddleOCR 官方 API（VL-1.6）：mock SDK 验证解析链路与错误传播
const mockClient = vi.hoisted(() => ({
  instance: { parseDocument: vi.fn() },
}));

vi.mock("@paddleocr/api-sdk", () => ({
  PaddleOCRClient: vi.fn(function () {
    return mockClient.instance;
  }),
  Model: { PaddleOCRVL16: "PaddleOCR-VL-1.6" },
}));

describe("parsePdfWithVl", () => {
  const config = { apiKey: "test-token" };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vl-parser-"));
    mockClient.instance.parseDocument.mockReset();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("解析成功：合并逐页 markdown 并拉取内嵌图片", async () => {
    const file = join(dir, "doc.pdf");
    await writeFile(file, "%PDF-1.4 fake");
    mockClient.instance.parseDocument.mockResolvedValue({
      pages: [
        {
          markdownText: "# 标题\n\n| 列A | 列B |\n|---|---|\n| 1 | 2 |",
          markdownImages: { "chart-0.png": "https://cdn.example.com/chart-0.png" },
        },
        { markdownText: "第二页正文", markdownImages: {} },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            arrayBuffer: async () => new TextEncoder().encode("png-bytes").buffer,
          }) as Response,
      ),
    );

    const result = await parsePdfWithVl(config, file);
    expect(result.markdown).toContain("| 列A | 列B |");
    expect(result.markdown).toContain("第二页正文");
    expect(result.images.get("chart-0.png")).toBe(Buffer.from("png-bytes").toString("base64"));
  });

  it("SDK 初始化缺 token 抛 VlParserError", async () => {
    const file = join(dir, "bad.pdf");
    await writeFile(file, "%PDF-1.4 fake");
    const { PaddleOCRClient } = await import("@paddleocr/api-sdk");
    vi.mocked(PaddleOCRClient).mockImplementationOnce(() => {
      throw new Error("Token is required");
    });
    await expect(parsePdfWithVl(config, file)).rejects.toBeInstanceOf(VlParserError);
  });

  it("SDK 解析失败抛 VlParserError", async () => {
    const file = join(dir, "fail.pdf");
    await writeFile(file, "%PDF-1.4 fake");
    mockClient.instance.parseDocument.mockRejectedValue(new Error("job failed: quota exhausted"));
    await expect(parsePdfWithVl(config, file)).rejects.toThrow(/quota exhausted/);
  });
});

// 降级链路：配置了 VL 但调用失败 → extract 仍返回本地解析结果
describe("extractDocument with VL fallback", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vl-fallback-"));
    mockClient.instance.parseDocument.mockReset();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("VL 调用失败降级本地解析，不抛错", async () => {
    mockClient.instance.parseDocument.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const file = join(dir, "simple.pdf");
    // 合法单页 PDF（含文本层）：本地 unpdf 可解析
    await writeFile(
      file,
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 20 100 Td (Hello VL fallback) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
    );
    const doc = await extractDocument(file, "simple.pdf", undefined, {
      apiKey: "test-token",
    });
    expect(doc.text).toContain("Hello VL fallback");
    expect(doc.images).toBeUndefined();
  });
});
