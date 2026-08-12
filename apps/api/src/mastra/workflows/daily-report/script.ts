import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import { dailyReportScriptSchema } from "@feedmind/contracts";
import { logger } from "../../../lib/logger.js";
import { scriptAgent } from "../../agents/script-agent.js";

export interface ScriptDeps {
  /** 生成脚本 JSON 文本；默认走 scriptAgent（LLM 纯文本输出） */
  generateScript?: (items: ExtractItem[]) => Promise<string>;
}

async function defaultGenerateScript(items: ExtractItem[]): Promise<string> {
  const result = await scriptAgent.generate(
    `以下是今日要点，请据此生成日报分镜脚本 JSON：\n${JSON.stringify(items)}`,
  );
  return result.text;
}

// 从 LLM 文本中解析出脚本 JSON：剥离可能的 markdown 代码块，取首尾大括号
export function parseScriptJson(raw: string): DailyReportScript {
  const cleaned = raw
    .replace(/```json\s*/i, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("脚本 JSON 解析失败");
  return dailyReportScriptSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}

// 兜底：extract 项 → 最小合法脚本（保证管线无 LLM 也能产出契约内脚本）
export function fallbackScript(items: ExtractItem[]): DailyReportScript {
  return {
    date: new Date().toISOString().slice(0, 10),
    opening: { hook: "今日日报" },
    items: items.map((item) => ({
      title: item.title,
      points: [],
      quote: null,
      narration: item.summary,
      source: item.source,
      image: null,
    })),
    closing: { summary: "以上是今日要点。" },
  };
}

/**
 * 把提炼要点转成分镜脚本。LLM 生成或 JSON 解析/契约校验失败时回退最小脚本，
 * 不让单次生成失败中断管线。
 */
export async function buildScript(
  items: ExtractItem[],
  deps: ScriptDeps = {},
): Promise<DailyReportScript> {
  // 无内容直接回退最小脚本，不触发 LLM（空日报无需生成脚本，也保证离线可测）
  if (items.length === 0) return fallbackScript(items);

  const generate = deps.generateScript ?? defaultGenerateScript;
  try {
    return parseScriptJson(await generate(items));
  } catch (err) {
    logger.warn({ err, itemCount: items.length }, "脚本生成失败，回退到最小脚本");
    return fallbackScript(items);
  }
}
