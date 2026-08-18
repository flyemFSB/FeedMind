import { apiFetch, backendApiPath } from "./client";

export type OpsAction = "create" | "update" | "delete" | "import" | "run";
export type OpsResult = "success" | "failed";

export interface OpsLogRow {
  id: number;
  ts: number;
  action: OpsAction;
  target: string;
  targetName: string;
  detail: string | null;
  result: OpsResult;
}

export interface OpsLogFilterParams {
  action?: OpsAction;
  target?: string;
  result?: OpsResult;
}

export function listOperations(
  limit = 50,
  offset = 0,
  filter: OpsLogFilterParams = {},
  signal?: AbortSignal,
): Promise<{ items: OpsLogRow[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filter.action) params.set("action", filter.action);
  if (filter.target) params.set("target", filter.target);
  if (filter.result) params.set("result", filter.result);
  return apiFetch(backendApiPath(`/ops-log?${params}`), { signal });
}
