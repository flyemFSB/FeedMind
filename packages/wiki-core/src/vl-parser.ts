import { PaddleOCRClient, Model } from "@paddleocr/api-sdk";

// 基于 PaddleOCR 官方托管 API（PaddleOCR-VL-1.6）的文档解析实现

export interface VlParserConfig {
  /** API 端点（默认官方 https://paddleocr.aistudio-app.com；自建代理时覆盖） */
  baseUrl?: string;
  /** PaddleOCR Access Token（AI Studio 获取） */
  apiKey: string;
  /** 轮询超时（毫秒），默认 10 分钟（大 PDF + 图表解析耗时） */
  timeoutMs?: number;
  /** 内嵌图片下载器：调用方可注入带 SSRF 校验的实现，缺省使用带超时与体积上限的下载 */
  fetchImage?: (url: string) => Promise<string | null>;
}

export interface VlParseResult {
  markdown: string;
  /** 提取出的文档图片：文件名 → base64 */
  images: Map<string, string>;
}

export class VlParserError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "VlParserError";
  }
}

const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_CONCURRENCY = 4;

/** 下载内嵌图片为 Base64：带超时与字节上限，防止单个超长响应拖垮进程 */
export async function fetchImageCapped(
  url: string,
  timeoutMs: number = IMAGE_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok || !resp.body) return null;
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size).toString("base64");
}

/** 调用 PaddleOCR 官方 API（VL-1.6）解析 PDF：
 * 失败（未配置 token/网络/业务/超时）一律抛 VlParserError，由调用方降级本地解析 */
export async function parsePdfWithVl(
  config: VlParserConfig,
  filePath: string,
): Promise<VlParseResult> {
  let client: PaddleOCRClient;
  try {
    client = new PaddleOCRClient({
      token: config.apiKey,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.timeoutMs ? { timeout: config.timeoutMs } : {}),
    });
  } catch (err) {
    throw new VlParserError(
      `VL API 初始化失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  let result;
  try {
    result = await client.parseDocument({
      filePath,
      model: Model.PaddleOCRVL16,
      options: {
        // 启用图表识别与 Markdown 格式排版美化，保全复杂 PDF 中的表格与数据信息
        useChartRecognition: true,
        prettifyMarkdown: true,
      },
    });
  } catch (err) {
    throw new VlParserError(
      `VL API 解析失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const markdown = result.pages
    .map((page) => page.markdownText)
    .filter(Boolean)
    .join("\n\n");

  // 内嵌图表原图转为 Base64 存储，获取失败降级为纯文本导入
  const images = new Map<string, string>();
  const fetchImage = config.fetchImage ?? fetchImageCapped;
  const imagePairs = result.pages.flatMap((page) => Object.entries(page.markdownImages));
  // 分批下载：图片 URL 来自文档内容，全量并发会打满内存与连接
  for (let i = 0; i < imagePairs.length; i += IMAGE_CONCURRENCY) {
    const batch = imagePairs.slice(i, i + IMAGE_CONCURRENCY);
    const fetched = await Promise.all(
      batch.map(async ([name, url]): Promise<readonly [string, string | null]> => {
        try {
          return [name, await fetchImage(url)];
        } catch {
          // 图片下载失败降级为 null
          return [name, null];
        }
      }),
    );
    for (const [name, data] of fetched) {
      if (data) images.set(name, data);
    }
  }

  return { markdown, images };
}
