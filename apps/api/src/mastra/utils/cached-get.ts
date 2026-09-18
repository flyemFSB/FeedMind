/**
 * 通用 TTL 缓存工具，用于减少重复的 DB 查询。
 * 所有使用 cachedGet 的模块共享同一个缓存空间（30s TTL 到期自动失效）。
 */

const store = new Map<string, { value: unknown; expiry: number }>();
const CACHE_TTL = 30_000; // 30 秒

export async function cachedGet<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expiry > now) return entry.value as T;
  const value = await fetch();
  store.set(key, { value, expiry: now + CACHE_TTL });
  return value;
}
