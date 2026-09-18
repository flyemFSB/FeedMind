import { queryOptions, useQuery } from "@tanstack/react-query";
import { listWikiSpaces, listWikiPages, listWikiSources, listIngestJobs } from "@/lib/api/wiki";

export const wikiOptions = {
  all: ["wiki"] as const,
  spaces: () =>
    queryOptions({ queryKey: [...wikiOptions.all, "spaces"] as const, queryFn: listWikiSpaces }),
  space: (id: string) =>
    queryOptions({ queryKey: [...wikiOptions.spaces().queryKey, id] as const }),
  pages: (spaceId: string) =>
    queryOptions({
      queryKey: [...wikiOptions.space(spaceId).queryKey, "pages"] as const,
      queryFn: () => listWikiPages(spaceId),
    }),
  sources: (spaceId: string) =>
    queryOptions({
      queryKey: [...wikiOptions.space(spaceId).queryKey, "sources"] as const,
      queryFn: () => listWikiSources(spaceId),
    }),
  jobs: (spaceId: string) =>
    queryOptions({
      queryKey: [...wikiOptions.space(spaceId).queryKey, "jobs"] as const,
      queryFn: () => listIngestJobs(spaceId),
    }),
};

// ─── 空间管理 Hooks ─────────────────────────────────────────

export function useWikiSpaces() {
  return useQuery(wikiOptions.spaces());
}

// ─── 概念页面管理 Hooks ─────────────────────────────────────

export function useWikiPages(spaceId: string | undefined) {
  return useQuery({
    ...wikiOptions.pages(spaceId!),
    enabled: !!spaceId,
  });
}

// ─── 知识来源管理 Hooks ─────────────────────────────────────

export function useWikiSources(
  spaceId: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    ...wikiOptions.sources(spaceId!),
    enabled: !!spaceId,
    ...options,
  });
}

// ─── 导入任务 Hooks ─────────────────────────────────────────

// 导入任务轮询：有 pending/processing 任务时每 3s 刷新，全部结束自动停止
// （refetchInterval 函数形式读取自身数据，官方轮询最佳实践）
export function useIngestJobs(spaceId: string | undefined) {
  return useQuery({
    ...wikiOptions.jobs(spaceId!),
    enabled: !!spaceId,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      return jobs?.some((j) => j.status === "pending" || j.status === "processing") ? 3000 : false;
    },
  });
}
