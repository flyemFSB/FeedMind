// 相对路径 import：纯函数模块不依赖 @/ alias，便于独立测试
import type { FeedItem } from "../api/feeds";

/** 已读是幂等标记：命中 id 的条目置为已读，其余原样返回 */
export function markFeedReadInCache(list: FeedItem[], id: string): FeedItem[] {
  return list.map((f) => (f.id === id ? { ...f, isRead: true } : f));
}

/** 乐观删除：移除命中的条目，其余原样返回 */
export function removeFeedsFromCache(list: FeedItem[], ids: string[]): FeedItem[] {
  // Set 命中 O(1)，避免列表 x ids 的双重线性扫描
  const idSet = new Set(ids);
  return list.filter((f) => !idSet.has(f.id));
}
