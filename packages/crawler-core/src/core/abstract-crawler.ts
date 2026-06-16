import type { CrawlerContext, ContentModel, CreatorModel, StoreResult } from "./types.js";

/**
 * 所有平台爬虫的抽象基类。
 *
 * 生命周期:
 *   const crawler = new XxxCrawler(cookies, proxyUrl, abortSignal);
 *   const result = await crawler.start(ctx, store);
 *   await crawler.cleanup();
 *
 * 子类重写 execute() 实现爬取逻辑。
 * 使用 this.fetchWithAbort() 进行带安全取消的 HTTP 请求。
 */
export abstract class AbstractCrawler {
  constructor(
    protected cookies?: string,
    protected proxyUrl?: string,
    protected abortSignal?: AbortSignal,
  ) {}

  /** 模板方法：管理生命周期，委托 execute() 执行实际逻辑 */
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

  /** 子类在此实现爬取逻辑。 */
  protected abstract execute(ctx: CrawlerContext, store: CrawlerStore): Promise<StoreResult>;

  /** 释放资源（浏览器等）。 */
  async cleanup(): Promise<void> {
    // subclasses override
  }

  /**
   * 带安全取消传播和默认超时（15s）的 fetch。
   * 创建与 this.abortSignal 关联的内部 AbortController，
   * 使请求在任务取消或超时时中断。
   */
  protected async fetchWithAbort(url: string, init?: RequestInit): Promise<Response> {
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

/** 爬虫保存结果的存储接口。 */
export interface CrawlerStore {
  saveContents(taskId: string, platform: string, contents: ContentModel[]): Promise<number>;

  saveCreators(taskId: string, platform: string, creators: CreatorModel[]): Promise<number>;

  updateTaskProgress(taskId: string, progress: number, total: number): Promise<void>;

  updateTaskStatus(taskId: string, status: string, error?: string): Promise<void>;
}
