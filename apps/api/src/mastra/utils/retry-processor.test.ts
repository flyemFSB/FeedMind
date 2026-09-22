import { describe, expect, it, vi } from "vitest";
import type { ProcessAPIErrorArgs } from "@mastra/core/processors";
import { createLlmRetryProcessor } from "./retry-processor.js";

/** processAPIError 只读取 error / retryCount / abortSignal，其余消息上下文与重试判定无关 */
function apiErrorArgs(
  error: unknown,
  retryCount: number,
  abortSignal?: AbortSignal,
): ProcessAPIErrorArgs {
  return {
    error,
    retryCount,
    stepNumber: 0,
    steps: [],
    state: {},
    ...(abortSignal ? { abortSignal } : {}),
  } as unknown as ProcessAPIErrorArgs;
}

describe("LLM 瞬时失败重试策略", () => {
  it("每个 agent 拿到独立实例，避免跨 agent 共享处理器状态", () => {
    expect(createLlmRetryProcessor()).not.toBe(createLlmRetryProcessor());
  });

  it("鉴权失败不重试（401 与 invalid_api_key）", async () => {
    const processor = createLlmRetryProcessor();
    await expect(
      processor.processAPIError(apiErrorArgs({ status: 401, message: "unauthorized" }, 0)),
    ).resolves.toBeUndefined();
    await expect(
      processor.processAPIError(apiErrorArgs({ code: "invalid_api_key", message: "bad key" }, 0)),
    ).resolves.toBeUndefined();
  });

  it("重试次数用尽后不再重试（上限 3 次）", async () => {
    await expect(
      createLlmRetryProcessor().processAPIError(apiErrorArgs(new Error("ECONNRESET"), 3)),
    ).resolves.toBeUndefined();
  });

  it("用户取消时立即打断退避等待，不阻塞停止操作", async () => {
    const controller = new AbortController();
    controller.abort();
    const started = performance.now();
    const result = await createLlmRetryProcessor().processAPIError(
      apiErrorArgs(new Error("transient"), 0, controller.signal),
    );
    // 首次退避配置为 1s：被中止的信号必须立刻放行
    expect(performance.now() - started).toBeLessThan(800);
    expect(result).toEqual({ retry: true });
  });

  it("重试时通过 writer.custom 下发持久化重试记录", async () => {
    const custom = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    controller.abort();
    const args = {
      ...apiErrorArgs(new Error("rate_limit_exceeded"), 0, controller.signal),
      writer: { custom },
    } as unknown as ProcessAPIErrorArgs;
    await createLlmRetryProcessor().processAPIError(args);
    expect(custom).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "data-retry",
        // 非 transient 才会写进消息 parts，重试痕迹在重新进入会话后依然可见
        transient: false,
        data: expect.objectContaining({
          attempt: 1,
          maxAttempts: 3,
          reason: "rate_limit_exceeded",
        }),
      }),
    );
  });
});
