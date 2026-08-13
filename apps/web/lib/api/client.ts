import { toast } from "@/components/ui/toast";
import type { ApiEnvelope } from "@feedmind/contracts";
import i18n from "@/lib/i18n";

export type { ApiEnvelope };

const backendApiBasePath = "/api/v1";
const agentApiBasePath = "/api/agent";

// 路径处理：自动添加 /api/v1 前缀，Agent 代理路径保持原样
export function backendApiPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath === agentApiBasePath || normalizedPath.startsWith(`${agentApiBasePath}/`)) {
    return normalizedPath;
  }
  if (
    normalizedPath === backendApiBasePath ||
    normalizedPath.startsWith(`${backendApiBasePath}/`)
  ) {
    return normalizedPath;
  }
  return `${backendApiBasePath}${normalizedPath}`;
}

// 通用 API 请求封装：解析统一信封格式，网络/业务错误通过 toast 提示
// signal 显式放行 undefined，避免 exactOptionalPropertyTypes 下每次调用都做条件展开
export type ApiFetchInit = Omit<RequestInit, "signal"> & {
  signal?: AbortSignal | null | undefined;
};
export async function apiFetch<T>(input: RequestInfo, init?: ApiFetchInit): Promise<T> {
  let response: Response;
  try {
    // ApiFetchInit 显式放行 signal: undefined，传给 fetch 前剥离，保持 RequestInit 兼容
    const { signal, ...rest } = init ?? {};
    response = await fetch(input, { ...rest, ...(signal ? { signal } : {}) });
  } catch (error) {
    // AbortError（组件卸载/StrictMode 重挂载）不弹 toast，直接透传
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const msg = i18n.t("error.networkUnreachable", {
      defaultValue: "无法连接到后端服务，请检查后端是否已启动",
    });
    toast.add({ title: msg, type: "error" });
    throw new Error(msg);
  }

  if (!response.ok) {
    const msg = await errorMessage(response);
    toast.add({ title: msg, type: "error" });
    // 挂上 HTTP 状态码，供业务侧按状态判断（如 401 登录失效），而非脆弱的中文文案全等比较
    const err = new Error(msg) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  // 204 No Content（DELETE 类接口）：无 body，不解析 JSON
  if (response.status === 204) return undefined as T;

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.error) {
    const title = resolveErrorMsg(envelope.error.message, envelope.error.i18n);
    toast.add({ title, type: "error" });
    // 挂上 HTTP 状态码与错误码，供业务侧按状态判断（如 401 登录失效），而非脆弱的中文文案全等比较
    const err = new Error(title) as Error & { status?: number; code?: string };
    err.status = response.status;
    err.code = envelope.error.code;
    throw err;
  }
  if (envelope.data == null) {
    const msg = i18n.t("error.emptyData", {
      defaultValue: "服务响应数据异常，请刷新后重试",
    });
    toast.add({ title: msg, type: "error" });
    throw new Error(msg);
  }
  return envelope.data;
}

// 信封错误消息：按翻译锚点 key 查词条（zh/en 双语资源），词条缺失时按 i18next
// 多级 fallback 链降级到通用文案，最后才用 API message 兜底
// （API message 是调试/兼容信息，不直接作为界面文案）
function resolveErrorMsg(
  fallback: string,
  i18nInfo?: { key: string; params?: Record<string, string | number> | undefined },
): string {
  if (!i18nInfo) return fallback;
  return i18n.t([i18nInfo.key, "apiError.unknown"], {
    ...i18nInfo.params,
    defaultValue: fallback,
  });
}

// 后端业务错误统一走 { data, error } 信封；仅当响应体不是信封
// （代理层 502/504、静态网关 HTML）才回退状态码兜底文案，
// 避免「系统错误 500」这类丢失原因的模糊提示
// 信封内 message 的语义化/兜底职责见 resolveErrorMsg
export async function errorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => null);
  if (body) {
    try {
      const envelope = JSON.parse(body) as ApiEnvelope<never>;
      if (envelope.error?.message) {
        return resolveErrorMsg(envelope.error.message, envelope.error.i18n);
      }
    } catch {
      // 解析失败说明响应体不是信封（如网关 HTML），回退状态码文案
    }
  }
  return httpMsg(response.status);
}

// 状态码兜底文案（非信封响应，如代理层网关错误）：zh/en 词条在 error.http.*，
// 词条缺失时用带状态码的通用文案兜底（i18next 标准多级 fallback）
function httpMsg(status: number): string {
  return i18n.t(`error.http.${status}`, { defaultValue: `请求失败（${status}）` });
}

// ─── HTTP verb helpers ─────────────────────────────────────────
function jsonHeaders(): HeadersInit {
  return { "content-type": "application/json" };
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch(backendApiPath(path), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch(backendApiPath(path), {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch(backendApiPath(path), {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return apiFetch(backendApiPath(path), { method: "DELETE" });
}
