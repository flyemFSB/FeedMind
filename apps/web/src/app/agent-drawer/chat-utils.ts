const TITLE_MAX_LEN = 15;

/** 一次模型重试的展示信息（来自 data-retry part） */
export interface RetryTrace {
  attempt: number;
  maxAttempts: number;
  delaySec: number | undefined;
  reason: string | undefined;
}

/** 消息性能监测数据（TTFT、总耗时、TPS、Token 统计） */
export interface MessageTelemetry {
  /** 首 Token 返回耗时（毫秒） */
  ttftMs?: number | undefined;
  /** 回答总耗时（毫秒） */
  durationMs?: number | undefined;
  /** 每秒输出 Token 速率（Tokens Per Second） */
  tps?: number | undefined;
  /** 该条回复估算 Token 数 */
  outputTokens?: number | undefined;
  /** 当前上下文总 Token 估算数 */
  contextTokens?: number | undefined;
}

/** 按首条消息生成会话标题：折叠空白并截断 */
export function makeChatTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "新会话";
  return clean.length > TITLE_MAX_LEN ? `${clean.slice(0, TITLE_MAX_LEN)}…` : clean;
}

/** 快速估算文本 Token 数（中文单字约 1 token，英文单词约 1.3 tokens） */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let nonCjk = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk++;
    } else if (code > 32) {
      nonCjk++;
    }
  }
  return Math.max(1, Math.ceil(cjk + nonCjk / 3.5));
}

/** 估算整条 UIMessage 的 Token 数（正文、思考片段、工具入参及出参） */
export function estimateMessageTokens(message: { parts: Array<Record<string, unknown>> }): number {
  let tokens = 0;
  for (const part of message.parts) {
    if (typeof part["text"] === "string") {
      tokens += estimateTokenCount(part["text"]);
    } else if (typeof part["type"] === "string" && part["type"].startsWith("tool-")) {
      const input = part["input"];
      const output = part["output"];
      if (input) {
        tokens += estimateTokenCount(typeof input === "string" ? input : JSON.stringify(input));
      }
      if (output) {
        tokens += estimateTokenCount(typeof output === "string" ? output : JSON.stringify(output));
      }
    }
  }
  return Math.max(1, tokens);
}

/** 格式化毫秒耗时为紧凑可读格式（<1s 显示毫秒，>=1s 保留一位小数） */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化 Token 计数（<1000 显示整数，>=1000 显示 k） */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  return `${(tokens / 1000).toFixed(1)}k`;
}

/** 上下文窗口各分类 Token 估算数据 */
export interface ContextWindowBreakdown {
  /** 系统与工具 Schema 底噪 */
  systemTokens: number;
  /** 问答正文与深度思考 */
  chatTokens: number;
  /** 工具调用入参、出参及外挂上下文 */
  toolTokens: number;
  /** 当前总计用量 */
  totalTokens: number;
}

/** 估算已落库会话的各分类 Token 分布 */
export function calculateContextBreakdown(
  messages: Array<{ parts: Array<Record<string, unknown>> }>,
  workspaceSnippet?: string,
): ContextWindowBreakdown {
  let chatTokens = 0;
  let toolTokens = 0;

  for (const message of messages) {
    for (const part of message.parts) {
      const type = typeof part["type"] === "string" ? part["type"] : "";
      if ((type === "text" || type === "reasoning") && typeof part["text"] === "string") {
        chatTokens += estimateTokenCount(part["text"]);
      } else if (type.startsWith("tool-")) {
        const input = part["input"];
        const output = part["output"];
        if (input) {
          toolTokens += estimateTokenCount(
            typeof input === "string" ? input : JSON.stringify(input),
          );
        }
        if (output) {
          toolTokens += estimateTokenCount(
            typeof output === "string" ? output : JSON.stringify(output),
          );
        }
      }
    }
  }

  if (workspaceSnippet) {
    toolTokens += estimateTokenCount(workspaceSnippet);
  }

  // 当已有历史消息时计入固定系统提示词底噪（约 1500 tokens）
  const systemTokens = messages.length > 0 ? 1500 : 0;
  const totalTokens = systemTokens + chatTokens + toolTokens;

  return {
    systemTokens,
    chatTokens,
    toolTokens,
    totalTokens,
  };
}
