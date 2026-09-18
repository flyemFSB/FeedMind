import { PaddleOCRClient, Model } from "@paddleocr/api-sdk";

// PaddleOCR 官方托管 API（PaddleOCR-VL-1.6 文档解析）：
// 官方 TypeScript SDK（@paddleocr/api-sdk），鉴权为 AI Studio Access Token。
// 官方文档：https://www.paddleocr.ai/latest/version3.x/inference_deployment/serving/paddleocr_official_api/

export interface VlParserConfig {
  /** API 端点（默认官方 https://paddleocr.aistudio-app.com；自建代理时覆盖） */
  baseUrl?: string;
  /** PaddleOCR Access Token（AI Studio 获取） */
  apiKey: string;
  /** 轮询超时（毫秒），默认 10 分钟（大 PDF + 图表解析耗时） */
  timeoutMs?: number;
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

  // 内嵌图表原图：将提取到的 markdownImages（文件名 → 远程 URL）转换为 Base64 编码内嵌存储；
  // 图片获取失败时不阻塞 Markdown 文本主解析流程（降级为纯文本导入）
  const images = new Map<string, string>();
  const fetchImage = async (url: string): Promise<string | null> => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer()).toString("base64");
    } catch {
      return null;
    }
  };
  const imagePairs = result.pages.flatMap((page) => Object.entries(page.markdownImages));
  await Promise.all(
    imagePairs.map(async ([name, url]) => {
      const data = await fetchImage(url);
      if (data) images.set(name, data);
    }),
  );

  return { markdown, images };
}
