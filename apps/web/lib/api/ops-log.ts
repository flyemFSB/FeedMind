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

export function listOperations(
  limit = 50,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ items: OpsLogRow[]; total: number }> {
  return apiFetch(backendApiPath(`/ops-log?limit=${limit}&offset=${offset}`), { signal });
}
