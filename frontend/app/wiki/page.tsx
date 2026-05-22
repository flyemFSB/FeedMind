import { WikiPageClient } from "@/components/wiki/wiki-page-client";
import { toWikiGraph, toWikiPage, toWikiSpace } from "@/lib/api/wiki";
import type { WikiGraphResponseWire, WikiPageResponse, WikiSpaceResponse } from "@/lib/api/wiki";
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
  const spaces = (await serverFetch<WikiSpaceResponse[]>("/wiki-spaces")).map(toWikiSpace);
  const firstSpaceId = spaces[0]?.id;
  if (!firstSpaceId) return { spaces, pages: [], graph: null, error: null };

  const [pages, graph] = await Promise.all([
    serverFetch<WikiPageResponse[]>(`/wiki-spaces/${firstSpaceId}/pages`),
    serverFetch<WikiGraphResponseWire>(`/wiki-spaces/${firstSpaceId}/graph`),
  ]);

  return { spaces, pages: pages.map(toWikiPage), graph: toWikiGraph(graph), error: null };
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
