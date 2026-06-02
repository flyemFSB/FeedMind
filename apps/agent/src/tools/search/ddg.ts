import { search } from "ddg-search";

export async function ddgSearch(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<{ title: string; url: string; content: string }[]> {
  const data = await search(query, {
    maxPages: 1,
    maxResults,
    region: "wt-wt",
    time: "all",
    signal,
  });

  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.description ?? "",
  }));
}
