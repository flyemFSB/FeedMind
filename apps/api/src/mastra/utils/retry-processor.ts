import { StreamErrorRetryProcessor } from "@mastra/core/processors";

interface ErrorWithAuthInfo {
  statusCode?: number | undefined;
  status?: number | undefined;
  code?: string | undefined;
  type?: string | undefined;
}

function isTerminalAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as ErrorWithAuthInfo;
  const status = rec.statusCode ?? rec.status;
  if (status === 401 || status === 403) return true;
  const code =
    typeof rec.code === "string" ? rec.code : typeof rec.type === "string" ? rec.type : "";
  return ["invalid_api_key", "authentication_error", "unauthorized"].includes(code.toLowerCase());
}

const MAX_RETRIES = 3;

/** 重试原因摘要：截断上游错误文案，保留关键排查信息 */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** LLM 调用瞬时失败重试处理器：跳过终态鉴权错误，支持指数退避与中止信号感知 */
export function createLlmRetryProcessor(): StreamErrorRetryProcessor {
  return new StreamErrorRetryProcessor({
    maxRetries: MAX_RETRIES,
    // 指数退避 1s/2s/4s：限流时避免连续冲击上游
    delayMs: ({ retryCount }) => Math.min(1000 * 2 ** retryCount, 8_000),
    retryUnknownErrors: true,
    // 压低 provider 建议的 Retry-After 上限：单步预算 120s，3 次重试不能把一步顶超时
    maxRetryAfterMs: 10_000,
    matchers: [
      {
        match: (error) => !isTerminalAuthError(error),
        onRetry: async (args) => {
          const { error, writer } = args as {
            error?: unknown;
            writer?: { custom?: (data: unknown) => Promise<void> };
          };
          const delaySec = Math.max(1, Math.round((args.delayMs ?? 1000) / 1000));
          const attempt = args.retryCount + 1;
          // 持久化重试记录（非 transient），供前端写入思考链保留重试痕迹
          await writer?.custom?.({
            type: "data-retry",
            transient: false,
            data: {
              attempt,
              maxAttempts: MAX_RETRIES,
              delaySec,
              reason: reasonOf(error),
            },
          });
        },
      },
    ],
  });
}
