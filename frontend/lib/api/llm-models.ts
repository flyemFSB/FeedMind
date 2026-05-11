import type { LLMModel } from "@/lib/types";

const backendApiUrl =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000";

type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};

type LLMModelResponse = {
  id: number;
  provider: string;
  model_name: string;
  base_url: string;
  has_api_key: boolean;
};

type LLMModelRuntimeResponse = {
  model_name: string;
  base_url: string;
  api_key: string;
};

const httpStatusMessages: Record<number, string> = {
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

function getHttpStatusMessage(status: number): string {
  return httpStatusMessages[status] ?? `请求失败（${status}）`;
}

function emitToast(message: string, type: "error" | "info" | "success" = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("feedmind:toast", { detail: { message, type } }),
  );
}

function toLLMModel(model: LLMModelResponse): LLMModel {
  return {
    id: String(model.id),
    provider: model.provider,
    modelName: model.model_name,
    baseUrl: model.base_url,
    hasApiKey: model.has_api_key,
  };
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(getHttpStatusMessage(response.status));
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.error) throw new Error(envelope.error.message);
  if (envelope.data == null) throw new Error("后端返回数据为空");
  return envelope.data;
}

async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    emitToast("无法连接到后端服务，请检查后端是否已启动", "error");
    throw new Error("无法连接到后端服务");
  }

  try {
    return await parseApiResponse<T>(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "请求失败";
    emitToast(msg, "error");
    throw err;
  }
}

export async function listLLMModels(signal?: AbortSignal): Promise<LLMModel[]> {
  const data = await apiFetch<LLMModelResponse[]>(
    `${backendApiUrl}/api/llm-models`,
    { signal },
  );
  return data.map(toLLMModel);
}

export async function createLLMModel(
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>(
    `${backendApiUrl}/api/llm-models`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: payload.provider,
        model_name: payload.modelName,
        base_url: payload.baseUrl,
        api_key: payload.apiKey,
      }),
    },
  );
  return toLLMModel(data);
}

export async function updateLLMModel(
  id: string,
  payload: Omit<LLMModel, "id" | "hasApiKey"> & { apiKey: string },
): Promise<LLMModel> {
  const data = await apiFetch<LLMModelResponse>(
    `${backendApiUrl}/api/llm-models/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: payload.provider,
        model_name: payload.modelName,
        base_url: payload.baseUrl,
        api_key: payload.apiKey,
      }),
    },
  );
  return toLLMModel(data);
}

export async function deleteLLMModel(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    `${backendApiUrl}/api/llm-models/${id}`,
    { method: "DELETE" },
  );
}

export async function getLLMModelRuntime(
  id: string,
  signal?: AbortSignal,
): Promise<LLMModelRuntimeResponse> {
  return apiFetch<LLMModelRuntimeResponse>(
    `${backendApiUrl}/api/llm-models/runtime?id=${Number(id)}`,
    { signal },
  );
}

export async function getSelectedLLMModel(signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(`${backendApiUrl}/api/llm-models/selected`, { signal });
    if (response.status === 404) return "";
    const data = await parseApiResponse<{ id: number }>(response);
    return String(data.id);
  } catch {
    return "";
  }
}

export async function setSelectedLLMModel(id: string): Promise<string> {
  const data = await apiFetch<{ id: number }>(
    `${backendApiUrl}/api/llm-models/selected`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(id) }),
    },
  );
  return String(data.id);
}
