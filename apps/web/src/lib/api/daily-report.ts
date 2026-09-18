import { apiFetch, backendApiPath, apiPost, apiPut } from "./client";

// ─── 类型（与后端 /daily-report 响应对齐） ───────────────────────

export interface ScheduleTask {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: "running" | "success" | "failed" | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportVideo {
  id: string;
  scheduleId: string;
  reportDate: string;
  status: "running" | "success" | "failed";
  stage: string | null;
  filePath: string | null;
  duration: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleUpsertInput {
  name: string;
  cron: string;
  enabled?: boolean;
}

// ─── 日报定时调度接口 ──────────────────────────────────────────

export async function listSchedules(): Promise<ScheduleTask[]> {
  return apiFetch<ScheduleTask[]>(backendApiPath("/daily-report/schedules"));
}

export function upsertSchedule(id: string, body: ScheduleUpsertInput): Promise<ScheduleTask> {
  return apiPut(`/daily-report/schedules/${encodeURIComponent(id)}`, body);
}

export function triggerReport(scheduleId: string): Promise<ReportVideo> {
  return apiPost("/daily-report/trigger", { scheduleId });
}

export async function listVideos(): Promise<ReportVideo[]> {
  return apiFetch<ReportVideo[]>(backendApiPath("/daily-report/videos"));
}

export function videoFileUrl(videoId: string): string {
  return backendApiPath(`/daily-report/videos/${encodeURIComponent(videoId)}/file`);
}
