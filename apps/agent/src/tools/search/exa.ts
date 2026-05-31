export async function exaSearch(query: string, maxResults: number, apiKey: string) {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: maxResults,
      contents: { highlights: true },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; highlights?: Array<{ text: string }> }>;
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.highlights?.map((h) => h.text).join("\n") ?? "",
  }));
}
