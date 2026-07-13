/**
 * 路由处理器参数与结果类型定义。
 *
 * 替代旧的 ContentModel/CreatorModel/CrawlerStore 模式，
 * 每个路由处理器是具有一致签名的独立异步函数。
 */

export interface RouteHandlerParams {
  /** 路由特定参数（如 { user_id: "..." }） */
  params: Record<string, unknown>;
  /** 可选的认证 Cookie */
  cookies?: string;
  /** 任务取消信号 */
  abortSignal: AbortSignal;
  /** RSS 输出的最大条目数 */
  maxItems: number;
}

export interface RouteHandlerResult {
  /** RSS 2.0 XML 字符串 */
  rssXml: string;
  /** 可选的日志元数据 */
  metadata?: {
    itemCount: number;
    platform: string;
  };
}

export type RouteHandler = (input: RouteHandlerParams) => Promise<RouteHandlerResult>;
