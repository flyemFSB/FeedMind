/** 源文件分块预算：把模型上下文窗口翻译成"一次能喂多少字符"。
 *  与 llm-client 的 max_tokens 同属"能力事实 → 策略"，都在导入链路起步处算一次。 */

/** 上下文窗口未知时的兜底（老行为，别再往下调：块越小跨块关联越差） */
export const DEFAULT_MAX_SOURCE_CHARS = 80_000;
/** 单块下限：再小就失去分析上下文，宁可让端点报上下文超限也不碎成沙 */
const MIN_SOURCE_CHARS = 2_000;
/** 模板开销预留（token）：返回格式说明、章节标题、分隔线等源码以外的文本 */
const PROMPT_OVERHEAD_TOKENS = 2_000;
/** 字符 → token 的保守换算系数：中文为主语料按 1 字符 ≈ 1 token 计（英文实际更省，属安全余量）。
 *  实测出现上下文超限就把这个系数调小，出现"块远小于窗口"就调大 */
const CHARS_PER_TOKEN = 1;

/**
 * 单个分块的字符上限。
 * 预算 = 上下文窗口 − 提示词（系统提示 + bundle 索引/schema + 输出）− 输出上限 − 模板开销；
 * 提示词与索引按字符数等量折 token（与源码同一套保守换算）。
 */
export function sourceChunkChars({
  contextTokens,
  outputTokens,
  promptChars,
}: {
  contextTokens: number | null | undefined;
  outputTokens: number | null | undefined;
  promptChars: number;
}): number {
  if (!contextTokens) return DEFAULT_MAX_SOURCE_CHARS;
  const available =
    contextTokens - promptChars * CHARS_PER_TOKEN - (outputTokens ?? 0) - PROMPT_OVERHEAD_TOKENS;
  if (available <= MIN_SOURCE_CHARS) return MIN_SOURCE_CHARS;
  return Math.floor(available * CHARS_PER_TOKEN);
}

/** 按上限切块，尽量落在空行（段落）边界；每块内容 trim 后丢弃空块 */
export function splitSourceContent(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) return [content];

  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + maxChars, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf("\n\n", end);
      if (boundary > start + 1_000) end = boundary;
    }
    chunks.push(content.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}
