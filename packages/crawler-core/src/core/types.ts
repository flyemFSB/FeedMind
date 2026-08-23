/**
 * 路由处理器参数与结果类型定义。
 *
 * 替代旧的 ContentModel/CreatorModel/CrawlerStore 模式，
 * 每个路由处理器是具有一致签名的独立异步函数。
 */

export interface RouteHandlerParams {
  /** 路由特定参数（如 { user_id: "..." }） */
  params: Record<string, unknown>;
  cookies?: string;
  abortSignal: AbortSignal;
  maxItems: number;
}

export interface RouteHandlerResult {
  rssXml: string;
  metadata?: {
    itemCount: number;
    platform: string;
  };
}

export type RouteHandler = (input: RouteHandlerParams) => Promise<RouteHandlerResult>;
