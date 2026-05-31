export async function braveSearch(query: string, maxResults: number, apiKey: string) {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> };
  };

  return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.description ?? "",
  }));
}
