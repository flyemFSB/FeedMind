import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSchedules,
  listVideos,
  triggerReport,
  upsertSchedule,
  type ReportVideo,
  type ScheduleTask,
  type ScheduleUpsertInput,
} from "@/lib/api/daily-report";

export const dailyReportOptions = {
  all: ["daily-report"] as const,
  schedules: () =>
    queryOptions({
      queryKey: [...dailyReportOptions.all, "schedules"] as const,
      queryFn: listSchedules,
      // 有任务运行中时轮询，让 schedule 状态徽章跟随完成/失败刷新
      refetchInterval: (query) => {
        const schedules = (query.state.data as ScheduleTask[] | undefined) ?? [];
        return schedules.some((s) => s.lastRunStatus === "running") ? 3000 : false;
      },
    }),
  videos: () =>
    queryOptions({
      queryKey: [...dailyReportOptions.all, "videos"] as const,
      queryFn: listVideos,
      // 有运行中的日报时每 3s 轮询，让完成/失败自动回显；无运行中则不轮询
      refetchInterval: (query) => {
        const videos = (query.state.data as ReportVideo[] | undefined) ?? [];
        return videos.some((v) => v.status === "running") ? 3000 : false;
      },
    }),
};

export function useDailyReportSchedules() {
  return useQuery(dailyReportOptions.schedules());
}

export function useDailyReportVideos() {
  return useQuery(dailyReportOptions.videos());
}

export function useUpsertSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ScheduleUpsertInput }) =>
      upsertSchedule(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dailyReportOptions.schedules().queryKey });
    },
  });
}

export function useTriggerReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerReport,
    onSuccess: () => {
      // 触发后同时刷新视频列表与任务状态（lastRun 回写）
      void queryClient.invalidateQueries({ queryKey: dailyReportOptions.videos().queryKey });
      void queryClient.invalidateQueries({ queryKey: dailyReportOptions.schedules().queryKey });
    },
  });
}
