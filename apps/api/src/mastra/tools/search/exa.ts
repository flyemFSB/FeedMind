import { Exa } from "exa-js";

export async function exaSearch(
  query: string,
  maxResults: number,
  apiKey: string,
  _signal?: AbortSignal,
) {
  const exa = new Exa(apiKey);

  const response = await exa.search(query, {
    numResults: maxResults,
    contents: { highlights: true },
  });

  return (response.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.highlights?.join("\n") ?? "",
  }));
}
