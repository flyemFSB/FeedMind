import { keepPreviousData, queryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { listOperations, type OpsAction, type OpsLogRow, type OpsResult } from "@/lib/api/ops-log";

const PAGE_SIZE = 50;

export interface OpsLogFilter {
  action?: OpsAction;
  target?: string;
  result?: OpsResult;
}

export const opsLogOptions = {
  all: ["ops-log"] as const,
  list: (filter: OpsLogFilter) =>
    queryOptions({
      queryKey: [...opsLogOptions.all, "list", filter] as const,
      queryFn: ({ signal }) => listOperations(PAGE_SIZE, 0, filter, signal),
    }),
};

/** 操作日志无限分页：筛选条件进 queryKey，切换筛选自动重新请求 */
export function useOpsLog(filter: OpsLogFilter) {
  return useInfiniteQuery({
    queryKey: [...opsLogOptions.all, "list", filter] as const,
    queryFn: ({ pageParam, signal }) => listOperations(PAGE_SIZE, pageParam, filter, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    // 官方 paginated-queries 实践：切换筛选时保留上一结果，避免骨架屏闪烁
    placeholderData: keepPreviousData,
    // 限制无限加载最大缓存页数，防止不断向下滚动导致前端内存无上限增长
    maxPages: 10,
  });
}

export type { OpsLogRow };
