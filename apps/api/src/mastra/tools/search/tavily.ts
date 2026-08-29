import { tavily } from "@tavily/core";

export async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string,
  _signal?: AbortSignal,
  language?: string,
) {
  const client = tavily({ apiKey });

  const response = await client.search(query, {
    searchDepth: "basic",
    maxResults,
    // 0.7+ 新参数：对结果做语言加权，中文知识库场景提升相关性
    ...(language ? { language } : {}),
  });

  return (response.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}
