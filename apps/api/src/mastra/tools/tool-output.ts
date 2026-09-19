/**
 * 工具结果回灌给模型的长度上限。
 *
 * 取值对齐主流 agent 的内联上限：Claude Code 的 Bash / 后台任务(含 subagent)输出
 * 内联上限默认约 30,000 字符（可用 bashOutputMaxChars / taskOutputMaxChars 调高到 128K，
 * 超出部分改存文件 + 预览；见 code.claude.com 的 settings/tools 参考）。
 * 4096 太保守：长文正文（抓取页面、概念页）刚开头就被砍，模型只能靠再抓一次补。
 * 超出时保留头尾而不是只留头部 —— 结论、下一步、错误栈尾巴往往在末尾。
 */
export const TOOL_OUTPUT_MAX_CHARS = 30_000;

/** 尾部保留比例（剩下的给头部）：尾部稍少，因为开头承担“这是什么”的定位信息 */
const TAIL_RATIO = 0.3;

export function truncateForModel(text: string, maxChars: number = TOOL_OUTPUT_MAX_CHARS): string {
  // 按字符（code point）计数，避免切开 emoji / 代理对
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;

  const tailChars = Math.floor(maxChars * TAIL_RATIO);
  const headChars = maxChars - tailChars;
  const omitted = chars.length - maxChars;
  return [
    chars.slice(0, headChars).join(""),
    `\n\n[... 已省略 ${omitted} 字符，保留开头与结尾 ...]\n\n`,
    chars.slice(chars.length - tailChars).join(""),
  ].join("");
}
