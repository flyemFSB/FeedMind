import crypto from "node:crypto";
import fsPromises from "node:fs/promises";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── 类型 ─────────────────────────────────────────────────────────

export interface ExtractedDocument {
  text: string;
  wordCount: number;
  pageCount?: number;
  warnings: string[];
  mimeType: string;
}

// ─── 格式检测 ────────────────────────────────────────────────────

const TEXT_EXTS = new Set(["md", "txt", "html", "htm", "csv", "json", "yaml", "yml", "xml", "rtf"]);
const BINARY_EXTS = new Set(["pdf", "docx", "pptx", "xlsx", "xls", "odt", "odp", "ods"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export const EXTRACTABLE_EXTS = new Set([...TEXT_EXTS, ...BINARY_EXTS, ...IMAGE_EXTS]);

export function isTextFormat(ext: string): boolean {
  return TEXT_EXTS.has(ext);
}

export function isBinaryFormat(ext: string): boolean {
  return BINARY_EXTS.has(ext);
}

export function isImageFormat(ext: string): boolean {
  return IMAGE_EXTS.has(ext);
}

export function detectFormat(fileName: string): string {
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  if (TEXT_EXTS.has(ext)) return "text";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "odt" || ext === "odp" || ext === "ods") return "office";
  return "unknown";
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    odt: "application/vnd.oasis.opendocument.text",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    md: "text/markdown",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "text/xml",
    rtf: "application/rtf",
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

// ─── PDF ───────────────────────────────────────────────────────────

async function extractPdf(filePath: string, fileName: string): Promise<ExtractedDocument> {
  // pdf-parse v2 直接导出函数本身（ESM 下不需要 .default）
  const pdfParse = await import("pdf-parse");
  const parseFn = (pdfParse as any).default ?? (pdfParse as any);
  const buf = await fsPromises.readFile(filePath);

  let text: string;
  let pageCount: number | undefined;
  try {
    const data = await parseFn(buf);
    text = data.text ?? "";
    pageCount = data.numpages ?? undefined;
  } catch (err) {
    return {
      text: `# ${fileName}\n\n[PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}]`,
      wordCount: 0,
      mimeType: "application/pdf",
      warnings: [`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const cleanText = text.trim();
  return {
    text: `# ${fileName}\n\n${cleanText || "(empty PDF)"}`,
    wordCount: cleanText.split(/\s+/).filter(Boolean).length,
    pageCount,
    mimeType: "application/pdf",
    warnings: [],
  };
}

// ─── DOCX ──────────────────────────────────────────────────────────

async function extractDocx(filePath: string, fileName: string): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");

  try {
    // 使用 extractRawText 获取干净纯文本（最适合 LLM 导入）
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value.trim();
    return {
      text: `# ${fileName}\n\n${text || "(empty document)"}`,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      warnings: result.messages
        .filter((m: { type: string }) => m.type === "warning")
        .map((m: { message: string }) => m.message),
    };
  } catch (err) {
    return {
      text: `# ${fileName}\n\n[DOCX extraction failed]`,
      wordCount: 0,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      warnings: [`DOCX extraction failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ─── PPTX（via officeparser）───────────────────────────────────────

async function extractPptx(filePath: string, fileName: string): Promise<ExtractedDocument> {
  try {
    const buf = await fsPromises.readFile(filePath);
    const officeparser = await import("officeparser");
    const rawText = (await officeparser.parseOffice(buf)) as unknown as string | undefined;
    const text = (rawText ?? "").trim();

    if (!text) {
      return {
        text: `# ${fileName}\n\n(no text content found in presentation)`,
        wordCount: 0,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        warnings: [],
      };
    }

    const clean = text.replace(/\n{3,}/g, "\n\n");
    return {
      text: `# ${fileName}\n\n${clean}`,
      wordCount: clean.split(/\s+/).filter(Boolean).length,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      warnings: [],
    };
  } catch (err) {
    return {
      text: `# ${fileName}\n\n[PPTX extraction failed]`,
      wordCount: 0,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      warnings: [`PPTX extraction failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ─── XLSX/XLS（via exceljs）────────────────────────────────────────

async function extractXlsx(filePath: string, fileName: string): Promise<ExtractedDocument> {
  const ExcelJS = await import("exceljs");

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const parts: string[] = [`# ${fileName}`];

    workbook.eachSheet((worksheet: any) => {
      parts.push(`\n## Sheet: ${worksheet.name} (${worksheet.rowCount} rows)`);

      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell: any) => headers.push(cell.text));
      if (headers.length > 0) {
        parts.push(`| ${headers.join(" | ")} |`);
        parts.push(`| ${headers.map(() => "---").join(" | ")} |`);
      }

      for (let i = 2; i <= Math.min(worksheet.rowCount, 200); i++) {
        const row = worksheet.getRow(i);
        const cells: string[] = [];
        let rowEmpty = true;
        row.eachCell((cell: any) => {
          cells.push(cell.text);
          if (cell.text.trim()) rowEmpty = false;
        });
        if (!rowEmpty) {
          parts.push(`| ${cells.join(" | ")} |`);
        }
      }

      if (worksheet.rowCount > 200) {
        parts.push(`\n_(${worksheet.rowCount - 200} more rows truncated)_`);
      }
    });

    const text = parts.join("\n");
    return {
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      warnings: [],
    };
  } catch (err) {
    return {
      text: `# ${fileName}\n\n[XLSX extraction failed]`,
      wordCount: 0,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      warnings: [`XLSX extraction failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ─── Office 格式（ODT/ODP/ODS）────────────────────────────────────

async function extractOfficeFile(filePath: string, fileName: string): Promise<ExtractedDocument> {
  try {
    const buf = await fsPromises.readFile(filePath);
    const officeparser = await import("officeparser");
    const rawText = (await officeparser.parseOffice(buf)) as unknown as string | undefined;
    const text = (rawText ?? "").trim();

    if (!text) {
      return {
        text: `# ${fileName}\n\n(no content extracted)`,
        wordCount: 0,
        mimeType: "application/vnd.oasis.opendocument.text",
        warnings: [],
      };
    }

    const clean = text.replace(/\n{3,}/g, "\n\n");
    return {
      text: `# ${fileName}\n\n${clean}`,
      wordCount: clean.split(/\s+/).filter(Boolean).length,
      mimeType: "application/vnd.oasis.opendocument.text",
      warnings: [],
    };
  } catch (err) {
    return {
      text: `# ${fileName}\n\n[Office document extraction failed]`,
      wordCount: 0,
      mimeType: "application/vnd.oasis.opendocument.text",
      warnings: [`Extraction failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// ─── 图片元数据 ────────────────────────────────────────────────────

const SUPPORTED_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

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
    text: `# ${fileName}\n\nImage file — included for reference.\n\n${metadata ? `## Metadata\n${metadata}` : ""}`,
    wordCount: 0,
    mimeType: mimeFromExt(ext) || "image/unknown",
    warnings: SUPPORTED_IMAGE_EXTS.has(ext) ? [] : [`Unsupported image format: ${ext}`],
  };
}

// ─── 主入口 ───────────────────────────────────────────────────────

export async function extractDocument(
  filePath: string,
  fileName: string,
  existingText?: string,
): Promise<ExtractedDocument> {
  // 检查文件大小限制
  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return {
        text: `# ${fileName}\n\n[File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit]`,
        wordCount: 0,
        mimeType: "application/octet-stream",
        warnings: [`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB`],
      };
    }
  } catch {
    /* file may not exist, continue to let format handler deal with it */
  }

  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  const format = detectFormat(fileName);

  switch (format) {
    case "text":
      return extractTextFile(filePath, fileName, existingText);
    case "pdf":
      return extractPdf(filePath, fileName);
    case "docx":
      return extractDocx(filePath, fileName);
    case "pptx":
      return extractPptx(filePath, fileName);
    case "xlsx":
      return extractXlsx(filePath, fileName);
    case "office":
      return extractOfficeFile(filePath, fileName);
    case "image":
      return extractImageInfo(filePath, fileName);
    default:
      return {
        text: `# ${fileName}\n\n[Unsupported file format: .${ext}]`,
        wordCount: 0,
        mimeType: mimeFromExt(ext),
        warnings: [`Unsupported format: .${ext}`],
      };
  }
}

// ─── 文件内容哈希（用于导入缓存）─────────────────────────────────

export async function fileContentHash(filePath: string): Promise<string> {
  try {
    const buf = await fsPromises.readFile(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}
