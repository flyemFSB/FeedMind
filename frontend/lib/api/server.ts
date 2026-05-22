import type { ApiEnvelope } from "./client";

const backendApiUrl = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${backendApiUrl}/api${path}`;
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`服务端请求失败（${response.status}）`);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.error) throw new Error(envelope.error.message);
  if (envelope.data == null) throw new Error("后端返回数据为空");
  return envelope.data;
}
