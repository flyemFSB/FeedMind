/**
 * Core types for the route handler pattern.
 *
 * Replaces the old ContentModel/CreatorModel/CrawlerStore pattern.
 * Each route handler is a standalone async function with a consistent signature.
 */

export interface RouteHandlerParams {
  /** Route-specific parameters (e.g. { user_id: "..." }) */
  params: Record<string, unknown>;
  /** Optional cookies for authenticated requests */
  cookies?: string;
  /** AbortSignal for task cancellation */
  abortSignal: AbortSignal;
  /** Maximum number of items to return in RSS feed */
  maxItems: number;
}

export interface RouteHandlerResult {
  /** RSS 2.0 XML string */
  rssXml: string;
  /** Optional metadata for logging */
  metadata?: {
    itemCount: number;
    platform: string;
  };
}

export type RouteHandler = (input: RouteHandlerParams) => Promise<RouteHandlerResult>;
