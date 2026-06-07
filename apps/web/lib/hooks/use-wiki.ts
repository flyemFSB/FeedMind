import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listWikiSpaces,
  createWikiSpace,
  updateWikiSpace,
  getWikiSpace,
  listWikiPages,
  createWikiPage,
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiBacklinks,
  listWikiSources,
  createWikiSource,
  deleteWikiSource,
  getWikiSource,
  getWikiGraph,
  getWikiGraphInsights,
  runLint,
  getLintItems,
  listReviewItems,
  resolveReviewItem,
  dismissReviewItem,
  sweepReviewItems,
  searchWiki,
} from "@/lib/api/wiki";

export const wikiKeys = {
  all: ["wiki"] as const,
  spaces: () => [...wikiKeys.all, "spaces"] as const,
  space: (id: string) => [...wikiKeys.spaces(), id] as const,
  pages: (spaceId: string) => [...wikiKeys.space(spaceId), "pages"] as const,
  page: (spaceId: string, pageId: string) => [...wikiKeys.pages(spaceId), pageId] as const,
  backlinks: (spaceId: string, pageId: string) => [...wikiKeys.page(spaceId, pageId), "backlinks"] as const,
  sources: (spaceId: string) => [...wikiKeys.space(spaceId), "sources"] as const,
  source: (spaceId: string, sourceId: string) => [...wikiKeys.sources(spaceId), sourceId] as const,
  graph: (spaceId: string) => [...wikiKeys.space(spaceId), "graph"] as const,
  graphInsights: (spaceId: string) => [...wikiKeys.space(spaceId), "graph", "insights"] as const,
  lint: (spaceId: string) => [...wikiKeys.space(spaceId), "lint"] as const,
  review: (spaceId: string) => [...wikiKeys.space(spaceId), "review"] as const,
  search: (spaceId: string) => [...wikiKeys.space(spaceId), "search"] as const,
};

// ─── Spaces ──────────────────────────────────────────────────────

export function useWikiSpaces() {
  return useQuery({
    queryKey: wikiKeys.spaces(),
    queryFn: listWikiSpaces,
  });
}

export function useCreateWikiSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWikiSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.spaces() });
    },
  });
}

// ─── Pages ───────────────────────────────────────────────────────

export function useWikiPages(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.pages(spaceId!),
    queryFn: () => listWikiPages(spaceId!),
    enabled: !!spaceId,
  });
}

export function useWikiPage(spaceId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.page(spaceId!, pageId!),
    queryFn: () => getWikiPage(spaceId!, pageId!),
    enabled: !!spaceId && !!pageId,
  });
}

export function useCreateWikiPage(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof createWikiPage>[1]) =>
      createWikiPage(spaceId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId!) });
    },
  });
}

export function useUpdateWikiPage(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, ...payload }: { pageId: string } & Parameters<typeof updateWikiPage>[2]) =>
      updateWikiPage(spaceId!, pageId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId!) });
    },
  });
}

export function useDeleteWikiPage(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => deleteWikiPage(spaceId!, pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.pages(spaceId!) });
    },
  });
}

// ─── Backlinks ───────────────────────────────────────────────────

export function useWikiBacklinks(spaceId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.backlinks(spaceId!, pageId!),
    queryFn: () => getWikiBacklinks(spaceId!, pageId!),
    enabled: !!spaceId && !!pageId,
  });
}

// ─── Sources ─────────────────────────────────────────────────────

export function useWikiSources(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.sources(spaceId!),
    queryFn: () => listWikiSources(spaceId!),
    enabled: !!spaceId,
  });
}

export function useCreateWikiSource(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof createWikiSource>[1]) =>
      createWikiSource(spaceId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.sources(spaceId!) });
    },
  });
}

export function useDeleteWikiSource(spaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => deleteWikiSource(spaceId!, sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.sources(spaceId!) });
    },
  });
}

// ─── Graph ───────────────────────────────────────────────────────

export function useWikiGraph(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.graph(spaceId!),
    queryFn: () => getWikiGraph(spaceId!),
    enabled: !!spaceId,
  });
}

export function useWikiGraphInsights(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.graphInsights(spaceId!),
    queryFn: () => getWikiGraphInsights(spaceId!),
    enabled: !!spaceId,
  });
}

// ─── Lint ────────────────────────────────────────────────────────

export function useWikiLintItems(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.lint(spaceId!),
    queryFn: () => getLintItems(spaceId!),
    enabled: !!spaceId,
  });
}

// ─── Review ──────────────────────────────────────────────────────

export function useWikiReviewItems(spaceId: string | undefined) {
  return useQuery({
    queryKey: wikiKeys.review(spaceId!),
    queryFn: () => listReviewItems(spaceId!),
    enabled: !!spaceId,
  });
}
