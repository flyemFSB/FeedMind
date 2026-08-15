import { queryOptions, useQuery } from "@tanstack/react-query";
import { listWikiSpaces, listWikiPages, listWikiSources } from "@/lib/api/wiki";

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
};

// ─── Spaces ──────────────────────────────────────────────────────

export function useWikiSpaces() {
  return useQuery(wikiOptions.spaces());
}

// ─── Pages ───────────────────────────────────────────────────────

export function useWikiPages(spaceId: string | undefined) {
  return useQuery({
    ...wikiOptions.pages(spaceId!),
    enabled: !!spaceId,
  });
}

// ─── Sources ─────────────────────────────────────────────────────

export function useWikiSources(spaceId: string | undefined) {
  return useQuery({
    ...wikiOptions.sources(spaceId!),
    enabled: !!spaceId,
  });
}
