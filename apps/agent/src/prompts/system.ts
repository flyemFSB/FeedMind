import { FEEDMIND_TIMEZONE } from "@feedmind/shared";
import { agentEnv } from "../env.js";

export const DEFAULT_SYSTEM_PROMPT = `你是 FeedMind，面向研究任务的 AI 助手。

规则：
- 涉及最新、实时或不确定事实时，用 \`web_search\`；需要正文时再用 \`web_fetch\`。
- 不编造来源；搜索无可用结果时，说明依据不是搜索结果。
- 回答清晰、结构化、可执行。`;

// 构建系统提示词：注入当前日期让模型能理解"今天""最近"等相对时间表述
// 日期格式 yyyy-MM-dd、时区由 FEEDMIND_TIMEZONE 控制，默认 Asia/Shanghai
export function buildSystemPrompt(): string {
  const basePrompt = agentEnv.FEEDMIND_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: FEEDMIND_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `${basePrompt.trim()}\n\ndate=${date}。\n搜索：相对日期按 date 解析；不要给 query 自动加年份，除非用户明确年份或说“今年/本年”。`;
}
