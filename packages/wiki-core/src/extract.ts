import fsPromises from "node:fs/promises";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── 类型 ─────────────────────────────────────────────────────────

export interface ExtractedDocument {
  text: string;
  wordCount: number;
  pageCount?: number; // anydoc 不暴露页数，保留字段以兼容旧消费者，恒为空
  warnings: string[];
  mimeType: string;
}

// ─── 格式检测 ────────────────────────────────────────────────────

// anydoc 不覆盖的格式才需要本地分支；其余（pdf/docx/pptx/xlsx/rtf/csv/epub/doc/ppt…）
// 全部交给 anydoc 按文件内容检测，扩展名只做 mimeType 映射
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

// ─── anydoc 统一转换 ──────────────────────────────────────────────

async function extractDocumentFile(filePath: string, fileName: string): Promise<ExtractedDocument> {
  const ext = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : "";
  try {
    // 官方推荐路径 API：格式从文件内容检测（CSV 等无签名格式回退扩展名），
    // 转换在 libuv 线程池执行，不阻塞事件循环
    const { toMarkdown } = await import("@firecrawl/anydoc");
    const markdown = (await toMarkdown(filePath)).trim();
    const text = `# ${fileName}\n\n${markdown || "(empty document)"}`;
    return {
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      mimeType: mimeFromExt(ext),
      warnings: [],
    };
  } catch (err) {
    // 仅当无法产出有意义内容时抛错，code 为 ConvertErrorCode：
    // unsupported | malformed | encrypted | resourceLimit | missingPart | io
    const e = err as { code?: string; message?: string };
    const reason =
      e.code === "unsupported"
        ? "不支持的格式"
        : e.code === "encrypted"
          ? "文档已加密"
          : "文档转换失败";
    const detail = e.message ? `（${e.message}）` : "";
    return {
      text: `# ${fileName}\n\n[${reason}${detail}]`,
      wordCount: 0,
      mimeType: mimeFromExt(ext),
      warnings: [`${reason}: ${e.code ?? "unknown"}${detail}`],
    };
  }
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
    text: `# ${fileName}\n\nImage file — included for reference.\n\n${metadata ? `## Metadata\n${metadata}` : ""}`,
    wordCount: 0,
    mimeType: mimeFromExt(ext) || "image/unknown",
    warnings: IMAGE_EXTS.has(ext) ? [] : [`Unsupported image format: ${ext}`],
  };
}

// ─── 主入口 ───────────────────────────────────────────────────────

export async function extractDocument(
  filePath: string,
  fileName: string,
  existingText?: string,
): Promise<ExtractedDocument> {
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
    /* 文件可能不存在，交给后续格式处理器兜底 */
  }

  switch (detectFormat(fileName)) {
    case "text":
      return extractTextFile(filePath, fileName, existingText);
    case "image":
      return extractImageInfo(filePath, fileName);
    default:
      // 未知扩展名也交给 anydoc：内容级检测能识别错标/无扩展名文件，识别不了会抛 unsupported
      return extractDocumentFile(filePath, fileName);
  }
}
