import fsPromises from "node:fs/promises";
import type { VlParserConfig } from "./vl-parser.js";
import { VlParserError, parsePdfWithVl } from "./vl-parser.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 单文件解析上限：10MB

// ─── 类型 ─────────────────────────────────────────────────────────

export interface ExtractedDocument {
  text: string;
  wordCount: number;
  pageCount?: number; // PDF 由 unpdf 提供；其余格式无页数概念，恒为空
  warnings: string[];
  mimeType: string;
  /** VL 解析时提取的文档内嵌图表原图（文件名 → base64），本地解析路径恒为空 */
  images?: Map<string, string>;
}

// ─── 格式检测 ────────────────────────────────────────────────────

// 纯文本与图片本地处理，其余格式（除 PDF 单独处理外）交给 anydoc 按内容检测
const TEXT_EXTS = new Set(["md", "txt", "html", "htm", "json", "yaml", "yml", "xml"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function detectFormat(fileName: string): "text" | "image" | "document" {
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  if (TEXT_EXTS.has(ext)) return "text";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "document";
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    pps: "application/vnd.ms-powerpoint",
    ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    odt: "application/vnd.oasis.opendocument.text",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    rtf: "application/rtf",
    epub: "application/epub+zip",
    csv: "text/csv",
    md: "text/markdown",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "text/xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}

// ─── 文本格式 ────────────────────────────────────────────────────

async function extractTextFile(
  filePath: string,
  fileName: string,
  content?: string,
): Promise<ExtractedDocument> {
  const text = content ?? (await fsPromises.readFile(filePath, "utf-8"));
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  return {
    text: `# ${fileName}\n\n` + text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    mimeType: mimeFromExt(ext),
    warnings: [],
  };
}

// ─── PDF（unpdf：Mozilla pdf.js 的服务端构建）──────────────────────

// PDF 单独走 unpdf（基于 pdf.js），兼容上游格式异常的 PDF 文件
async function extractPdfFile(
  filePath: string,
  fileName: string,
  vl?: VlParserConfig,
): Promise<ExtractedDocument> {
  if (vl) {
    try {
      // PDF 优先走视觉模型解析结构与图表，失败降级本地 unpdf
      const result = await parsePdfWithVl(vl, filePath);
      const all = `# ${fileName}\n\n${result.markdown.trim() || "(empty document)"}`;
      return {
        text: all,
        wordCount: all.split(/\s+/).filter(Boolean).length,
        mimeType: "application/pdf",
        warnings: [],
        images: result.images,
      };
    } catch (err) {
      // VL 解析异常降级为本地 unpdf
      if (!(err instanceof VlParserError)) throw err;
    }
  }
  const bytes = await fsPromises.readFile(filePath);
  const { extractText } = await import("unpdf");
  try {
    // unpdf 明确拒绝 Buffer，要求 Uint8Array；mergePages: true 时 text 保证为 string
    const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    // text.length 判断而非 ||：空文本需占位，避免 lint 的 nullish 建议改变语义
    const all = `# ${fileName}\n\n${text.length ? text : "(empty document)"}`;
    return {
      text: all,
      wordCount: all.split(/\s+/).filter(Boolean).length,
      pageCount: totalPages,
      mimeType: "application/pdf",
      warnings: [],
    };
  } catch (err) {
    // pdf.js 抛 InvalidPDFException 等（无 code 字段）；统一补 code 供调用方按类型处理
    const e = err instanceof Error ? err : new Error(String(err));
    (e as { code?: string }).code = "malformed";
    throw e;
  }
}

// ─── anydoc 统一转换 ──────────────────────────────────────────────

async function extractDocumentFile(
  filePath: string,
  fileName: string,
  vl?: VlParserConfig,
): Promise<ExtractedDocument> {
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  if (ext === "pdf") return extractPdfFile(filePath, fileName, vl);
  // 转换失败直接抛错（code 为 ConvertErrorCode：unsupported | malformed | encrypted |
  // resourceLimit | missingPart | io | needsOcr），由调用方决定如何处理；绝不产生占位文本当源内容
  const { toMarkdown } = await import("@firecrawl/anydoc");
  let markdown: string;
  try {
    markdown = (await toMarkdown(filePath)).trim();
  } catch (err) {
    // anydoc 0.2.4 起扫描型或纯图 PDF 不再静默丢页，而是抛出 NeedsOcrError（包含 pages/pageCount）。
    // 经内容嗅探检测出的扩展名错误或无扩展名 PDF 文件进入此分支：若配置了视觉语言模型（VL），则交由视觉模型兜底解析
    if ((err as { code?: string }).code === "needsOcr" && vl) {
      const pageCount = (err as { pageCount?: number }).pageCount;
      try {
        const result = await parsePdfWithVl(vl, filePath);
        const all = `# ${fileName}\n\n${result.markdown.trim() || "(empty document)"}`;
        return {
          text: all,
          wordCount: all.split(/\s+/).filter(Boolean).length,
          ...(pageCount !== undefined ? { pageCount } : {}),
          mimeType: "application/pdf",
          warnings: [],
          images: result.images,
        };
      } catch (vlErr) {
        // VL 也失败时不降级 unpdf——扫描页只会得到空文本（重蹈静默丢页），
        // 以 VlParserError 重抛并保留 needsOcr 上下文
        throw new VlParserError(
          `扫描型 PDF 需 OCR${pageCount !== undefined ? `（共 ${pageCount} 页）` : ""}，VL 解析失败: ${vlErr instanceof Error ? vlErr.message : String(vlErr)}`,
          vlErr,
        );
      }
    }
    throw err;
  }
  const text = `# ${fileName}\n\n${markdown || "(empty document)"}`;
  return {
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    mimeType: mimeFromExt(ext),
    warnings: [],
  };
}

// ─── 图片元数据 ────────────────────────────────────────────────────

async function extractImageInfo(filePath: string, fileName: string): Promise<ExtractedDocument> {
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  let metadata = "";

  try {
    const stat = await fsPromises.stat(filePath);
    const fileType = await import("file-type");
    const buf = await fsPromises.readFile(filePath);
    const type = await fileType.fileTypeFromBuffer(buf);

    if (type) {
      metadata = `- Format: ${type.mime}\n- Extension: ${type.ext}\n`;
    }
    metadata += `- Size: ${(stat.size / 1024).toFixed(1)} KB\n`;

    if (ext === "svg") {
      const content = buf.toString("utf-8");
      const dimMatch = content.match(/<svg[^>]*?width=["'](\d+)/i);
      if (dimMatch) metadata += `- Width: ${dimMatch[1]}px`;
    }
  } catch {
    /* 尽力而为，失败不影响主流程 */
  }

  return {
    text: `# ${fileName}\n\n图片文件（作为参考材料归档）\n\n${metadata ? `## 元数据\n${metadata}` : ""}`,
    wordCount: 0,
    mimeType: mimeFromExt(ext) || "image/unknown",
    warnings: IMAGE_EXTS.has(ext) ? [] : [`不支持的图片格式: .${ext}`],
  };
}

// ─── 主入口 ───────────────────────────────────────────────────────

export async function extractDocument(
  filePath: string,
  fileName: string,
  existingText?: string,
  vl?: VlParserConfig,
): Promise<ExtractedDocument> {
  let stat;
  try {
    stat = await fsPromises.stat(filePath);
  } catch {
    /* 文件可能不存在，交给后续格式处理器兜底 */
  }
  if (stat && stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制（实际 ${(stat.size / 1024 / 1024).toFixed(1)}MB）`,
    );
  }

  switch (detectFormat(fileName)) {
    case "text":
      return extractTextFile(filePath, fileName, existingText);
    case "image":
      return extractImageInfo(filePath, fileName);
    default:
      // 未知扩展名统一交由 anydoc 处理：内容嗅探能够自动识别格式标注错误或缺失扩展名的文件，无法识别时会抛出 unsupported 异常
      return extractDocumentFile(filePath, fileName, vl);
  }
}
