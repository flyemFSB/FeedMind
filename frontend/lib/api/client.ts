import { toast } from "sonner";

export type ApiEnvelope<T> = {
  data: T | null;
  error?: { code: string; message: string } | null;
};

const backendApiBasePath = "/api/v1";
const agentApiBasePath = "/api/agent";

export function backendApiPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath === agentApiBasePath || normalizedPath.startsWith(`${agentApiBasePath}/`)) {
    return normalizedPath;
  }
  if (normalizedPath === backendApiBasePath || normalizedPath.startsWith(`${backendApiBasePath}/`)) {
    return normalizedPath;
  }
  return `${backendApiBasePath}${normalizedPath}`;
}

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    toast.error("无法连接到后端服务，请检查后端是否已启动");
    throw new Error("无法连接到后端服务");
  }

  if (!response.ok) {
    const msg = httpMsg(response.status);
    toast.error(msg);
    throw new Error(msg);
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.error) {
    toast.error(envelope.error.message);
    throw new Error(envelope.error.message);
  }
  if (envelope.data == null) {
    toast.error("后端返回数据为空");
    throw new Error("后端返回数据为空");
  }
  return envelope.data;
}

const _msgs: Record<number, string> = {
  400: "请求参数有误", 401: "登录状态已失效", 403: "没有操作权限",
  404: "请求的资源不存在", 409: "已存在同名模型", 422: "请求参数校验失败",
  500: "服务器暂时不可用", 502: "网关服务异常", 503: "服务暂时不可用", 504: "服务响应超时",
};

function httpMsg(status: number): string {
  return _msgs[status] ?? `请求失败（${status}）`;
}
