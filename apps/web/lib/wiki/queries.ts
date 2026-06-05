import { useCallback, useEffect } from "react";
import { create } from "zustand";
import type {
  WikiPageListItem, WikiPageRead, WikiBacklink,
  WikiSourceListItem, WikiSearchResult, WikiGraph,
} from "@feedmind/contracts";
import {
  listWikiPages, getWikiPage, getWikiBacklinks,
  listWikiSources, searchWiki, getWikiGraph, getWikiGraphInsights,
} from "@/lib/api/wiki";

// ─── Cache TTL ────────────────────────────────────────────────────
const PAGE_LIST_TTL = 5_000;     // 5 seconds
const PAGE_TTL = 30_000;          // 30 seconds
const SOURCE_LIST_TTL = 10_000;   // 10 seconds

// ─── Store Types ──────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  loading: boolean;
  error: string | null;
}

interface WikiState {
  // Caches keyed by `${spaceId}::${suffix}`
  pageLists: Record<string, CacheEntry<{ items: WikiPageListItem[]; total: number }>>;
  pages: Record<string, CacheEntry<WikiPageRead>>;
  backlinks: Record<string, CacheEntry<WikiBacklink[]>>;
  sourceLists: Record<string, CacheEntry<{ items: WikiSourceListItem[]; total: number }>>;
  searchResults: Record<string, CacheEntry<WikiSearchResult[]>>;
  graphData: Record<string, CacheEntry<WikiGraph>>;
  graphInsights: Record<string, CacheEntry<any>>;

  invalidateSpace(spaceId: string): void;
  invalidateAll(): void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function cacheKey(spaceId: string, suffix: string): string {
  return `${spaceId}::${suffix}`;
}

function isFresh<T>(entry: CacheEntry<T> | undefined, ttl: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.loadedAt < ttl;
}

function loadingEntry<T>(previous?: T): CacheEntry<T | null> {
  return { data: previous ?? null as any, loadedAt: Date.now(), loading: true, error: null };
}

function loadedEntry<T>(data: T): CacheEntry<T> {
  return { data, loadedAt: Date.now(), loading: false, error: null };
}

function errorEntry<T>(error: string, previous?: T): CacheEntry<T | null> {
  return { data: previous ?? null as any, loadedAt: Date.now(), loading: false, error };
}

// ─── Store ────────────────────────────────────────────────────────

export const useWikiStore = create<WikiState>((set, get) => ({
  pageLists: {},
  pages: {},
  backlinks: {},
  sourceLists: {},
  searchResults: {},
  graphData: {},
  graphInsights: {},

  invalidateSpace(spaceId: string) {
    const prefix = `${spaceId}::`;
    const filter = (entries: Record<string, any>) => {
      for (const key of Object.keys(entries)) {
        if (key.startsWith(prefix)) delete entries[key];
      }
      return { ...entries };
    };
    set((s) => ({
      pageLists: filter(s.pageLists),
      pages: filter(s.pages),
      backlinks: filter(s.backlinks),
      sourceLists: filter(s.sourceLists),
      searchResults: filter(s.searchResults),
      graphData: filter(s.graphData),
    }));
  },

  invalidateAll() {
    set({
      pageLists: {}, pages: {}, backlinks: {},
      sourceLists: {}, searchResults: {},
      graphData: {}, graphInsights: {},
    });
  },
}));

// ─── Data Fetching Hooks ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  field: keyof WikiState,
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const entry = useWikiStore((s: WikiState) => (s as any)[field]?.[key]) as CacheEntry<T> | undefined;

  const doFetch = useCallback(async () => {
    useWikiStore.setState((s: WikiState) => {
      const f = { ...(s as any)[field] };
      f[key] = loadingEntry(entry?.data);
      return { [field]: f } as any;
    });

    try {
      const data = await fetcher();
      useWikiStore.setState((s: WikiState) => {
        const f = { ...(s as any)[field] };
        f[key] = loadedEntry(data);
        return { [field]: f } as any;
      });
    } catch (err) {
      useWikiStore.setState((s: WikiState) => {
        const f = { ...(s as any)[field] };
        f[key] = errorEntry(err instanceof Error ? err.message : "Unknown error", entry?.data);
        return { [field]: f } as any;
      });
    }
  }, [key, field, fetcher]);

  useEffect(() => {
    if (!entry || !isFresh(entry, ttl)) {
      doFetch();
    }
  }, [doFetch]);

  if (entry && isFresh(entry, ttl) && !entry.loading) {
    return { data: entry.data, loading: false, error: entry.error, refresh: doFetch };
  }

  return { data: entry?.data ?? null, loading: !entry || entry.loading, error: entry?.error ?? null, refresh: doFetch };
}

// ─── Public Hooks ─────────────────────────────────────────────────

export function useWikiPages(
  spaceId: string,
  opts?: { type?: string; q?: string; limit?: number },
) {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const key = cacheKey(spaceId, `pages?${params.toString()}`);

  return useCache(
    key,
    PAGE_LIST_TTL,
    () => listWikiPages(spaceId, opts as any),
    "pageLists" as keyof WikiState,
  );
}

export function useWikiPage(spaceId: string, pageId: string | null) {
  const pageKey = pageId ? cacheKey(spaceId, `page:${pageId}`) : "";
  const backlinksKey = pageId ? cacheKey(spaceId, `backlinks:${pageId}`) : "";

  const page = useCache(
    pageKey,
    PAGE_TTL,
    () => getWikiPage(spaceId, pageId!),
    "pages" as keyof WikiState,
  );

  const backlinks = useCache(
    backlinksKey,
    PAGE_TTL,
    () => getWikiBacklinks(spaceId, pageId!),
    "backlinks" as keyof WikiState,
  );

  return { page, backlinks };
}

export function useWikiSources(spaceId: string) {
  const key = cacheKey(spaceId, "sources");
  return useCache(
    key,
    SOURCE_LIST_TTL,
    () => listWikiSources(spaceId, { limit: 100 }),
    "sourceLists" as keyof WikiState,
  );
}

export function useInvalidateWiki() {
  const store = useWikiStore();
  return (spaceId: string) => store.invalidateSpace(spaceId);
}
