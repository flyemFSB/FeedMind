import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDataDir } from "../../lib/data-dir.js";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";

/**
 * models.dev 模型目录 —— 上下文窗口 / 最大输出 / 展示名的唯一来源。
 *
 * WHY 依赖上游而不是在仓库里维护表：模型上下限几个月就换代一次，硬编码表必然过期；
 * models.dev 是 Mastra 与 Vercel AI Gateway 的共同上游，也是目前唯一公开提供
 * per-model `limit` 的数据集（AI SDK 与 Mastra 自身都不暴露这层映射）。
 * 拉取结果落盘缓存，离线时退回旧副本，保证本地优先（Local-first）场景可用。
 */
const CATALOG_URL = "https://models.dev/api.json";
const CACHE_FILE = "model-catalog.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

/** FeedMind provider 展示名 → models.dev provider id */
const PROVIDER_IDS: Record<string, string> = {
  ChatGPT: "openai",
  Claude: "anthropic",
  DeepSeek: "deepseek",
  Gemini: "google",
  GLM: "zhipuai",
  Kimi: "moonshotai",
  MiniMax: "minimax",
  Qwen: "alibaba",
};

export interface CatalogModel {
  /** API 调用名（对应 model 表的 model_id） */
  model_id: string;
  /** 展示名（对应 model 表的 model_name） */
  name: string;
  /** K tokens，与 model 表单位一致；上游缺 limit 时为 null */
  context_window: number | null;
  max_output: number | null;
}

interface RawModel {
  name?: string;
  limit?: { context?: number; output?: number } | null;
  modalities?: { output?: string[] } | null;
  release_date?: string;
}
interface RawCatalog {
  [providerId: string]: { models?: Record<string, RawModel> } | undefined;
}

interface CachedCatalog {
  fetched_at: number;
  providers: Record<string, CatalogModel[]>;
}

/** token 绝对值 → K tokens（DB 与 UI 均以 K 为单位，64 → 64000） */
export function toKTokens(tokens: number | undefined): number | null {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return null;
  return Math.max(1, Math.round(tokens / 1000));
}

/** 只留可对话模型：输出含文本且非嵌入模型，否则选择器会混入 TTS / 绘图 / embedding */
function isChatModel(id: string, raw: RawModel): boolean {
  if (/embedding/i.test(id)) return false;
  const output = raw.modalities?.output;
  return !Array.isArray(output) || output.includes("text");
}

/** 抽取本项目需要的字段，按发布时间倒序（新的在前） */
export function mapCatalog(raw: RawCatalog): Record<string, CatalogModel[]> {
  const providers: Record<string, CatalogModel[]> = {};

  for (const [displayName, devId] of Object.entries(PROVIDER_IDS)) {
    const models = raw[devId]?.models ?? {};
    providers[displayName] = Object.entries(models)
      .filter(([id, model]) => isChatModel(id, model))
      .sort((a, b) => (b[1].release_date ?? "").localeCompare(a[1].release_date ?? ""))
      .map(([id, model]) => ({
        model_id: id,
        name: model.name?.trim() || id,
        context_window: toKTokens(model.limit?.context),
        max_output: toKTokens(model.limit?.output),
      }));
  }

  return providers;
}

let memo: CachedCatalog | null = null;
let inflight: Promise<CachedCatalog> | null = null;

function isFresh(cache: CachedCatalog): boolean {
  return Date.now() - cache.fetched_at < CACHE_TTL_MS;
}

async function readDiskCache(): Promise<CachedCatalog | null> {
  try {
    const cache = JSON.parse(
      await readFile(join(resolveDataDir(), CACHE_FILE), "utf8"),
    ) as CachedCatalog;
    return cache?.providers ? cache : null;
  } catch {
    return null;
  }
}

async function fetchCatalog(): Promise<CachedCatalog> {
  const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`models.dev 返回 ${response.status}`);

  const cache: CachedCatalog = {
    fetched_at: Date.now(),
    providers: mapCatalog((await response.json()) as RawCatalog),
  };
  await writeFile(join(resolveDataDir(), CACHE_FILE), JSON.stringify(cache)).catch((err: unknown) =>
    logger.warn({ err }, "写入模型列表缓存失败"),
  );
  return cache;
}

/** 加载目录：内存 → 磁盘 → 网络；刷新失败时宁可返回过期副本也不报错 */
async function loadCatalog(): Promise<CachedCatalog> {
  if (memo && isFresh(memo)) return memo;

  const stale = memo ?? (await readDiskCache());
  if (stale && isFresh(stale)) {
    memo = stale;
    return stale;
  }

  inflight ??= fetchCatalog().finally(() => {
    inflight = null;
  });

  try {
    memo = await inflight;
    return memo;
  } catch (err) {
    if (stale) {
      logger.warn({ err }, "模型列表远程刷新失败，回退使用本地缓存副本");
      memo = stale;
      return stale;
    }
    throw new HttpError(
      503,
      "HTTP_ERROR",
      "模型目录拉取失败，请检查网络后重试",
      {},
      {
        cause: err,
        i18nKey: "apiError.modelCatalogUnavailable",
      },
    );
  }
}

/** 列出某 provider 的可选模型；自定义 provider 无目录数据，返回空数组由前端手填 */
export async function listCatalogModels(provider: string): Promise<CatalogModel[]> {
  if (!PROVIDER_IDS[provider]) return [];
  return (await loadCatalog()).providers[provider] ?? [];
}
