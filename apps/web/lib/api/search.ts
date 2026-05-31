import { apiFetch, backendApiPath } from "./client";

export type SearchConfig = {
  braveApiKey?: string;
  tavilyApiKey?: string;
  exaApiKey?: string;
  preferredEngine?: string;
};

export async function getSearchConfig(signal?: AbortSignal): Promise<SearchConfig> {
  const data = await apiFetch<{ data: SearchConfig }>(backendApiPath("/search/config"), { signal });
  return data.data;
}

export async function updateSearchConfig(
  config: SearchConfig,
  signal?: AbortSignal,
): Promise<SearchConfig> {
  const data = await apiFetch<{ data: SearchConfig }>(backendApiPath("/search/config"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  return data.data;
}
