import { apiFetch, backendApiPath } from "./client";
import type { ToolRead, ToolConfigUpdate } from "@feedmind/contracts";

export async function listTools(signal?: AbortSignal): Promise<ToolRead[]> {
  return apiFetch<ToolRead[]>(backendApiPath("/tools"), { signal });
}

export async function updateAllToolConfigs(
  configs: Record<string, ToolConfigUpdate>,
  signal?: AbortSignal,
): Promise<ToolRead[]> {
  return apiFetch<ToolRead[]>(backendApiPath("/tools"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configs),
    signal,
  });
}
