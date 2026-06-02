/**
 * AnySearch 搜索引擎 —— 无需 API Key 即可使用（匿名模式受速率和日配额限制）。
 *
 * 匿名模式限制（实测）：
 *   - `X-Ratelimit-Limit: 10`（每次时间窗口 10 次请求）
 *   - 超出后返回 `402 daily_free_quota_exhausted`
 *
 * 注册用户（免费 API Key）有更高的每日免费额度。
 * 注册地址: https://www.anysearch.com/console/api-keys
 */
export async function anysearchSearch(
  query: string,
  maxResults: number,
  apiKey?: string,
): Promise<{ title: string; url: string; content: string }[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch("https://api.anysearch.com/v1/search", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, max_results: maxResults }),
    signal: AbortSignal.timeout(10_000),
  });

  // 402 表示免费额度耗尽，但响应体中包含可用的临时凭证
  if (response.status === 402) {
    const body = (await response.json()) as {
      data?: { api_key?: string; username?: string; password?: string };
    };
    if (body?.data?.api_key || body?.data?.username) {
      // 匿名额度耗尽，但响应返回了自动注册的凭证 —— 重试一次
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (body.data.api_key) {
        retryHeaders.Authorization = `Bearer ${body.data.api_key}`;
      }
      const retryResponse = await fetch("https://api.anysearch.com/v1/search", {
        method: "POST",
        headers: retryHeaders,
        body: JSON.stringify({ query, max_results: maxResults }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!retryResponse.ok) {
        throw new Error(`AnySearch search failed: ${retryResponse.status}`);
      }
      const retryData = (await retryResponse.json()) as {
        data?: { results?: Array<{ title: string; url: string; description?: string; content?: string }> };
      };
      return normalizeResults(retryData);
    }
    throw new Error("AnySearch daily free quota exhausted");
  }

  if (!response.ok) {
    throw new Error(`AnySearch search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: { results?: Array<{ title: string; url: string; description?: string; content?: string }> };
  };

  return normalizeResults(data);
}

function normalizeResults(
  data: {
    data?: { results?: Array<{ title: string; url: string; description?: string; content?: string }> };
  },
): { title: string; url: string; content: string }[] {
  return (data?.data?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? r.description ?? "",
  }));
}
