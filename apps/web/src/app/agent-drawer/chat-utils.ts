const TITLE_MAX_LEN = 15;

/** 一次模型重试的展示信息（来自 data-retry part） */
export interface RetryTrace {
  attempt: number;
  maxAttempts: number;
  delaySec: number | undefined;
  reason: string | undefined;
}

/** 按首条消息生成会话标题：折叠空白并截断 */
export function makeChatTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "新会话";
  return clean.length > TITLE_MAX_LEN ? `${clean.slice(0, TITLE_MAX_LEN)}…` : clean;
}
