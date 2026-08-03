import { FEEDMIND_TIMEZONE } from "@feedmind/shared";

export const DEFAULT_SYSTEM_PROMPT = `你是 FeedMind，面向研究任务的 AI 助手。

规则：
- 不编造来源；搜索无可用结果时，说明依据不是搜索结果。
- 回答清晰、结构化、可执行。
- 调用工具时，数组参数必须传 JSON 数组（如 ["a","b"]），数字必须传数字不要传字符串。`;

/** 构建系统提示词：注入当前日期让模型能理解"今天""最近"等相对时间表述 */
export function buildSystemPrompt(customPrompt?: string): string {
  const basePrompt = customPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: FEEDMIND_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `${basePrompt.trim()}\n\ndate=${date}。`;
}
