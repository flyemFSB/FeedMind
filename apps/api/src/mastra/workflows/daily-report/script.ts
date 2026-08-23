import type { DailyReportScript, ExtractItem } from "@feedmind/contracts";
import { dailyReportScriptSchema } from "@feedmind/contracts";
import { logger } from "../../../lib/logger.js";
import { scriptAgent } from "../../agents/script-agent.js";

export interface ScriptDeps {
  /** 生成分镜脚本对象；默认走 scriptAgent（structuredOutput 直接产出契约内对象） */
  generateScript?: (items: ExtractItem[]) => Promise<DailyReportScript>;
}

async function defaultGenerateScript(items: ExtractItem[]): Promise<DailyReportScript> {
  const result = await scriptAgent.generate(
    `以下是今日要点，请据此生成日报分镜脚本：\n${JSON.stringify(items)}`,
    { structuredOutput: { schema: dailyReportScriptSchema } },
  );
  return result.object;
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
 * 把提炼要点转成分镜脚本。structuredOutput 由框架按 schema 校验，生成/校验失败时
 * 回退最小脚本，不让单次生成失败中断管线。
 */
export async function buildScript(
  items: ExtractItem[],
  deps: ScriptDeps = {},
): Promise<DailyReportScript> {
  // 无内容直接回退最小脚本，不触发 LLM（空日报无需生成脚本，也保证离线可测）
  if (items.length === 0) return fallbackScript(items);

  try {
    return await (deps.generateScript ?? defaultGenerateScript)(items);
  } catch (err) {
    logger.warn({ err, itemCount: items.length }, "脚本生成失败，回退到最小脚本");
    return fallbackScript(items);
  }
}
