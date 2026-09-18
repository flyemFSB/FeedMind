import { markFeedReadInCache, removeFeedsFromCache } from "./feed-cache";
import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { listFeeds, syncFeeds, markFeedRead, deleteFeeds, type FeedItem } from "@/lib/api/feeds";
import {
  listRssSources,
  addRssSource,
  removeRssSource,
  listCookies,
  checkPlatformCookie,
  listCrawlerOptions,
} from "@/lib/api/sources";

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

// ─── 信息源与同步 Hooks ─────────────────────────────────────────

// 长耗时操作（同步订阅 / Cookie 批量校验需逐源驱动爬虫，可达数十秒）的"进行中"反馈
// 必须跨页面导航存活：mutation 实体驻留 MutationCache，与组件生命周期无关，页面卸载后
// 仍可按 mutationKey 读到 pending 态；组件内 useState 或 observer.isPending 都随卸载丢失，
// 导致返回后按钮复位成可点击态、用户误以为同步已中断而重复触发
export const syncFeedsMutationKey = [...feedOptions.all, "sync"] as const;
export const checkCookieMutationKey = [...feedOptions.all, "cookie-check"] as const;

// 派生当前 pending 中各次调用的 variables（同步无 variables 时数组元素为 undefined，仅用长度）
export function usePendingMutationVariables<T>(mutationKey: readonly unknown[]): T[] {
  return useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables as T,
  });
}

export function useFeeds() {
  return useQuery(feedOptions.list());
}

export function useSyncFeeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: syncFeedsMutationKey,
    mutationFn: syncFeeds,
    onSuccess: () => {
      // 同步会更新 lastSyncedAt 与条目数，订阅管理页（sources）同样需要刷新，
      // 否则同步后页面看起来毫无变化（后端已生效但缓存未失效）；
      // 同步成功还会回写 cookie 有效状态，一并失效让 Cookie 面板反映最新结论
      void queryClient.invalidateQueries({ queryKey: feedOptions.list().queryKey });
      void queryClient.invalidateQueries({ queryKey: feedOptions.sources().queryKey });
      void queryClient.invalidateQueries({ queryKey: feedOptions.cookies().queryKey });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: checkCookieMutationKey,
    mutationFn: checkPlatformCookie,
    // 校验会把 valid/checkedAt 写回服务端，失效 cookies 缓存让面板即时反映最新结论
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedOptions.cookies().queryKey });
    },
  });
}

// ─── 爬虫下拉选项 ───────────────────────────────────────────────

export function useCrawlerOptions(listApi: string | undefined) {
  return useQuery({
    ...feedOptions.crawlerOptions(listApi!),
    enabled: !!listApi,
  });
}
