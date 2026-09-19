/** 爬虫路由处理器参数与结果类型定义 */

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
