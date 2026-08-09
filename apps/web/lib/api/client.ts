import { toast } from "@/components/ui/toast";
import type { ApiEnvelope } from "@feedmind/contracts";

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
    toast.add({ title: "无法连接到后端服务，请检查后端是否已启动", type: "error" });
    throw new Error("无法连接到后端服务");
  }

  if (!response.ok) {
    const msg = httpMsg(response.status);
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
    toast.add({ title: envelope.error.message, type: "error" });
    throw new Error(envelope.error.message);
  }
  if (envelope.data == null) {
    toast.add({ title: "后端返回数据为空", type: "error" });
    throw new Error("后端返回数据为空");
  }
  return envelope.data;
}

const _msgs: Record<number, string> = {
  400: "请求参数有误",
  401: "登录状态已失效",
  403: "没有操作权限",
  404: "请求的资源不存在",
  409: "已存在同名模型",
  422: "请求参数校验失败",
  500: "服务器暂时不可用",
  502: "网关服务异常",
  503: "服务暂时不可用",
  504: "服务响应超时",
};

function httpMsg(status: number): string {
  return _msgs[status] ?? `请求失败（${status}）`;
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
