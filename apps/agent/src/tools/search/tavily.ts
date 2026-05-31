import { tavily } from "@tavily/core";

export async function tavilySearch(query: string, maxResults: number, apiKey: string) {
  const client = tavily({ apiKey });

  const response = await client.search(query, {
    searchDepth: "basic",
    maxResults,
  });

  return (response.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}
