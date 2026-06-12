import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "./types.js";

/**
 * Abstract base for all platform crawlers.
 *
 * Lifecycle:
 *   const crawler = new XxxCrawler(cookies, proxyUrl, abortSignal);
 *   const result = await crawler.start(ctx, store);
 *   await crawler.cleanup();
 *
 * Subclasses override execute() to implement crawl logic.
 * Use this.fetchWithAbort() for HTTP requests with safe cancellation.
 */
export abstract class AbstractCrawler {
  constructor(
    protected cookies?: string,
    protected proxyUrl?: string,
    protected abortSignal?: AbortSignal,
  ) {}

  /** Template method: manages lifecycle, delegates to execute() */
  async start(ctx: CrawlerContext, store: CrawlerStore): Promise<StoreResult> {
    await store.updateTaskStatus(ctx.taskId, "running");

    try {
      const result = await this.execute(ctx, store);

      await store.updateTaskProgress(ctx.taskId, result.insertedContents, ctx.maxNotes);

      if (this.abortSignal?.aborted) {
        await store.updateTaskStatus(ctx.taskId, "cancelled");
      } else {
        await store.updateTaskStatus(ctx.taskId, "completed");
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateTaskStatus(ctx.taskId, "failed", msg);
      return { insertedContents: 0, insertedCreators: 0 };
    }
  }

  /** Subclasses implement crawl logic here. */
  protected abstract execute(
    ctx: CrawlerContext,
    store: CrawlerStore,
  ): Promise<StoreResult>;

  /** Release resources (browser, etc.). */
  async cleanup(): Promise<void> {
    // subclasses override
  }

  /**
   * Fetch with safe abort propagation and default timeout（15s）.
   * Creates an inner AbortController linked to this.abortSignal
   * so the request is cancelled when the task is cancelled or times out.
   */
  protected async fetchWithAbort(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(15_000);
    const onAbort = () => controller.abort();
    this.abortSignal?.addEventListener("abort", onAbort, { once: true });
    timeout.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      this.abortSignal?.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Store interface used by crawlers to persist results.
 */
export interface CrawlerStore {
  saveContents(
    taskId: string,
    platform: string,
    contents: ContentModel[],
  ): Promise<number>;

  saveCreators(
    taskId: string,
    platform: string,
    creators: CreatorModel[],
  ): Promise<number>;

  updateTaskProgress(
    taskId: string,
    progress: number,
    total: number,
  ): Promise<void>;

  updateTaskStatus(
    taskId: string,
    status: string,
    error?: string,
  ): Promise<void>;
}
