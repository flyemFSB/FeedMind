import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArticleText, webFetchTool } from "./web-fetch.js";

const mockGetTool = vi.hoisted(() => vi.fn());

// 工具配置走 DB，单测里替换为固定 config，避免为读一个 apiKey 拉起整个服务层
vi.mock("./search/config.js", () => ({
  ToolConfigClient: {
    getInstance: () => ({
      load: async () => [],
      getTool: mockGetTool,
    }),
  },
}));

function stubFetch(impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function firecrawlOk(markdown: string): Response {
  return new Response(JSON.stringify({ data: { markdown } }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockGetTool.mockReset();
  mockGetTool.mockReturnValue({ name: "web_fetch", config: {}, is_enabled: true });
});

describe("fetchArticleText 的 SSRF 防线", () => {
  it("拒绝云元数据地址，且不发出任何网络请求", async () => {
    const fetchMock = stubFetch(async () => firecrawlOk("x"));

    await expect(fetchArticleText("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /SSRF blocked/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("拒绝私网地址与回环地址", async () => {
    const fetchMock = stubFetch(async () => firecrawlOk("x"));

    await expect(fetchArticleText("http://192.168.1.1/admin")).rejects.toThrow(/SSRF blocked/);
    await expect(fetchArticleText("http://127.0.0.1:9333/json")).rejects.toThrow(/SSRF blocked/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("拒绝非 http(s) 协议", async () => {
    const fetchMock = stubFetch(async () => firecrawlOk("x"));

    await expect(fetchArticleText("file:///etc/passwd")).rejects.toThrow(/SSRF blocked/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchArticleText 抓取与截断", () => {
  it("透传 Firecrawl 返回的 markdown", async () => {
    stubFetch(async () => firecrawlOk("# 标题\n正文内容"));

    await expect(fetchArticleText("https://example.com/a")).resolves.toBe("# 标题\n正文内容");
  });

  it("仅空白内容的 markdown 视为抓取失败", async () => {
    stubFetch(async () => firecrawlOk("   \n  "));

    await expect(fetchArticleText("https://example.com/a")).rejects.toThrow(/无法抓取页面内容/);
  });

  it("超过 maxChars 时保留头尾并插入省略标记", async () => {
    const long = "头".repeat(60) + "中".repeat(200) + "尾".repeat(60);
    stubFetch(async () => firecrawlOk(long));

    const text = await fetchArticleText("https://example.com/a", undefined, 100);
    expect(text).toContain("[... 已省略 220 字符，保留开头与结尾 ...]");
    expect(text.startsWith("头".repeat(60))).toBe(true);
    expect(text.endsWith("尾".repeat(30))).toBe(true);
  });

  it("Firecrawl 非 2xx 时抛错", async () => {
    stubFetch(async () => new Response("upstream boom", { status: 500 }));

    await expect(fetchArticleText("https://example.com/a")).rejects.toThrow(/无法抓取页面内容/);
  });

  it("Firecrawl 返回非预期结构时抛错", async () => {
    stubFetch(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    await expect(fetchArticleText("https://example.com/a")).rejects.toThrow(/无法抓取页面内容/);
  });
});

describe("fetchArticleText 的 Firecrawl 鉴权", () => {
  it("配置了 firecrawlApiKey 时带 Bearer 鉴权，未配置时走匿名请求", async () => {
    const fetchMock = stubFetch(async () => firecrawlOk("x"));

    mockGetTool.mockReturnValue({
      name: "web_fetch",
      config: { firecrawlApiKey: "fc-secret" },
      is_enabled: true,
    });
    await fetchArticleText("https://example.com/a");
    const authed = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(authed["Authorization"]).toBe("Bearer fc-secret");

    fetchMock.mockClear();
    mockGetTool.mockReturnValue({ name: "web_fetch", config: {}, is_enabled: true });
    await fetchArticleText("https://example.com/a");
    const anon = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(anon["Authorization"]).toBeUndefined();
  });
});

describe("webFetchTool", () => {
  it("执行时把调用方的中止信号并入底层请求（用户点停止要能真的打断抓取）", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    stubFetch(async (_input, init) => {
      seen = init?.signal ?? undefined;
      return firecrawlOk("x");
    });

    await webFetchTool.execute!({ url: "https://example.com/a" }, {
      abortSignal: controller.signal,
    } as never);

    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });
});
