import { WikiPageClient } from "@/components/wiki/wiki-page-client";
import { toWikiGraph, toWikiPage, toWikiSpace } from "@/lib/api/wikis";
import type { WikiGraphResponseWire, WikiPageResponse, WikiSpaceResponse } from "@/lib/api/wikis";
import type { WikiGraphResponse, WikiPage, WikiSpace } from "@/lib/types";
import { serverFetch } from "@/lib/api/server";

export const dynamic = "force-dynamic";

type InitialWikiData = {
  spaces: WikiSpace[];
  pages: WikiPage[];
  graph: WikiGraphResponse | null;
  error: string | null;
};

async function loadInitialWikiData(): Promise<InitialWikiData> {
  const spaces = (await serverFetch<WikiSpaceResponse[]>("/wikis")).map(toWikiSpace);
  const firstSpaceId = spaces[0]?.id;
  if (!firstSpaceId) return { spaces, pages: [], graph: null, error: null };

  const [pagesResult, graphResult] = await Promise.allSettled([
    serverFetch<WikiPageResponse[]>(`/wikis/${firstSpaceId}/pages`),
    serverFetch<WikiGraphResponseWire>(`/wikis/${firstSpaceId}/graph`),
  ]);

  const pages = pagesResult.status === "fulfilled" ? pagesResult.value.map(toWikiPage) : [];
  const graph = graphResult.status === "fulfilled" ? toWikiGraph(graphResult.value) : null;
  const error = [pagesResult, graphResult].some((result) => result.status === "rejected")
    ? "部分 WIKI 数据加载失败，可稍后重试"
    : null;

  return { spaces, pages, graph, error };
}

export default async function MyWikiPage() {
  let data: InitialWikiData;

  try {
    data = await loadInitialWikiData();
  } catch (err) {
    data = { spaces: [], pages: [], graph: null, error: err instanceof Error ? err.message : "加载 WIKI 数据失败" };
  }

  return <WikiPageClient {...data} />;
}
