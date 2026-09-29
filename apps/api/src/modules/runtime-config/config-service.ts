import { eq } from "drizzle-orm";
import { db, model } from "@feedmind/db";
import { decryptValue } from "../../lib/crypto/fernet.js";
import { assertPublicUrl } from "../../lib/ssrf.js";
import { fetchImageCapped } from "@feedmind/wiki-core";
import { HttpError } from "../../lib/http.js";

/**
 * 用途级采样参数与系统提示词：原 runtime_config 表已随「用途 → 模型」绑定收敛而删除，
 * 参数回归代码常量，不再由用户编辑。
 */
export const RUNTIME_SAMPLING = {
  temperature: 0.2,
  top_p: 1,
  system_prompt: "",
} as const;

/** 需要解析模型的运行时用途 */
export type RuntimePurpose = "chat" | "wiki";

type ModelRow = typeof model.$inferSelect;

async function loadModelByUsage(usage: string): Promise<ModelRow | undefined> {
  const [row] = await db.select().from(model).where(eq(model.usage, usage)).limit(1);
  return row;
}

/** 有效模型：知识导入未绑定专用模型时回退对话模型 */
export async function resolveRuntimeModel(purpose: RuntimePurpose): Promise<ModelRow> {
  const row =
    purpose === "wiki"
      ? ((await loadModelByUsage("wiki")) ?? (await loadModelByUsage("chat")))
      : await loadModelByUsage("chat");

  if (!row) {
    throw new HttpError(
      400,
      "MODEL_NOT_CONFIGURED",
      "尚未绑定对话模型。请在设置 → 模型配置中添加模型并设为默认对话模型。",
      {},
      { i18nKey: "apiError.modelNotConfigured", i18nParams: { runtime: purpose } },
    );
  }
  return row;
}

export interface RuntimeModelConfig {
  model_name: string;
  model_id: string;
  llm_id: number;
  base_url: string;
  api_key: string;
  max_output: string;
  temperature: number;
  top_p: number;
  system_prompt: string;
}

/** 运行时模型配置：模型来自用途绑定，采样参数来自代码常量 */
export async function getRuntimeConfig(purpose: RuntimePurpose): Promise<RuntimeModelConfig> {
  const row = await resolveRuntimeModel(purpose);
  const apiKey = row.apiKey ? decryptValue(row.apiKey) : "";

  if (!apiKey && !row.baseUrl) {
    throw new Error(
      `[config] Runtime "${purpose}": model "${row.name}" 缺少 API Key 与 Base URL，请在设置 → 模型配置中补全。`,
    );
  }

  return {
    model_name: row.name,
    model_id: row.apiModel,
    llm_id: row.id,
    base_url: row.baseUrl,
    api_key: apiKey,
    max_output: row.maxOutput != null ? String(row.maxOutput) : "",
    ...RUNTIME_SAMPLING,
  };
}

/** OCR 文档内嵌图片下载：公网校验后按超时与体积上限拉取 */
async function fetchOcrImage(url: string): Promise<string | null> {
  await assertPublicUrl(url);
  return fetchImageCapped(url);
}

/** OCR 文档解析模型配置：未绑定返回 null 供调用方降级本地解析 */
export async function getRuntimeOcrConfig(): Promise<{
  baseUrl: string;
  apiKey: string;
  fetchImage: (url: string) => Promise<string | null>;
} | null> {
  const row = await loadModelByUsage("ocr");
  if (!row || !row.apiKey) return null;
  return {
    baseUrl: row.baseUrl,
    apiKey: decryptValue(row.apiKey),
    fetchImage: fetchOcrImage,
  };
}
