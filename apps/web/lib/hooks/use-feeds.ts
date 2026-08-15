import { markFeedReadInCache, removeFeedsFromCache } from "./feed-cache";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFeeds,
  syncFeeds,
  markFeedRead,
  deleteFeeds,
  listRssSources,
  addRssSource,
  removeRssSource,
  listCookies,
  checkPlatformCookie,
  listCrawlerOptions,
  type FeedItem,
} from "@/lib/api/feeds";

export const feedOptions = {
  all: ["feeds"] as const,
  list: () => queryOptions({ queryKey: [...feedOptions.all, "list"] as const, queryFn: listFeeds }),
  sources: () =>
    queryOptions({ queryKey: [...feedOptions.all, "sources"] as const, queryFn: listRssSources }),
  cookies: () =>
    queryOptions({ queryKey: [...feedOptions.all, "cookies"] as const, queryFn: listCookies }),
  crawlerOptions: (listApi: string) =>
    queryOptions({
      queryKey: [...feedOptions.all, "crawler", listApi] as const,
      queryFn: () => listCrawlerOptions(listApi),
      // Cookie 失效 401 不必重试（每次重试都会重新拉起爬虫路由），网络失败也一样
      retry: false,
    }),
};

// ─── Feeds ──────────────────────────────────────────────────────

export function useFeeds() {
  return useQuery(feedOptions.list());
}

export function useSyncFeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncFeeds,
    onSuccess: () => {
      // 同步会更新 lastSyncedAt 与条目数，订阅管理页（sources）同样需要刷新，
      // 否则同步后页面看起来毫无变化（后端已生效但缓存未失效）
      void queryClient.invalidateQueries({ queryKey: feedOptions.list().queryKey });
      void queryClient.invalidateQueries({ queryKey: feedOptions.sources().queryKey });
    },
  });
}

export function useMarkFeedRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markFeedRead,
    // 已读是幂等标记，成功后直接更新缓存，避免整表刷新
    onSuccess: (_data, feedId) => {
      queryClient.setQueryData<FeedItem[]>(feedOptions.list().queryKey, (old) =>
        old ? markFeedReadInCache(old, feedId) : old,
      );
    },
  });
}

export function useDeleteFeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFeeds,
    // 乐观移除已删条目，确认后立即从界面消失并触发剩余卡片 layout 动画；
    // 失败时用快照回滚，避免已删内容闪回
    onMutate: async (ids) => {
      const key = feedOptions.list().queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeedItem[]>(key);
      queryClient.setQueryData<FeedItem[]>(key, (old) =>
        old ? removeFeedsFromCache(old, ids) : old,
      );
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(feedOptions.list().queryKey, ctx.previous);
    },
    onSettled: () => {
      // 兜底与后端对齐（如并发同步新增的条目），后台静默刷新不闪骨架屏
      void queryClient.invalidateQueries({ queryKey: feedOptions.list().queryKey });
    },
  });
}

// ─── RSS 订阅源 ─────────────────────────────────────────────────

export function useRssSources() {
  return useQuery(feedOptions.sources());
}

export function useAddRssSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addRssSource,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedOptions.sources().queryKey });
    },
  });
}

export function useRemoveRssSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeRssSource,
    onSuccess: () => {
      // 删除源后 feeds 列表仍可能缓存该源的条目，一并失效避免跨页不一致
      void queryClient.invalidateQueries({ queryKey: feedOptions.sources().queryKey });
      void queryClient.invalidateQueries({ queryKey: feedOptions.list().queryKey });
    },
  });
}

// ─── Cookie 管理 ───────────────────────────────────────────────

export function useCookies() {
  return useQuery(feedOptions.cookies());
}

export function useCheckPlatformCookie() {
  return useMutation({
    mutationFn: checkPlatformCookie,
  });
}

// ─── 爬虫下拉选项 ───────────────────────────────────────────────

export function useCrawlerOptions(listApi: string | undefined) {
  return useQuery({
    ...feedOptions.crawlerOptions(listApi!),
    enabled: !!listApi,
  });
}
