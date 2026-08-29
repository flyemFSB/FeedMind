import { afterEach, describe, expect, it, vi } from "vitest";
// weread 直连路由：mock 全局 fetch，验证书架/文章列表/正文解析与增量去重。
// 覆盖网络层到 rssXml 的完整链路，改动接口字段时此处会先红。
// 路由内置 1-1.5s 防风控间隔，测试用真实 sleep（不使用 fake timers）。
import { getRouteHandler } from "../core/route-registry.js";
import "../routes/index.js";

const SHELF = {
  errCode: 0,
  books: [
    { title: "千问AI平台", bookId: "MP_WXS_3239545440" },
    { title: "普通书籍", bookId: "123456" }, // 非公众号应被过滤
  ],
};

const ARTICLES = {
  errCode: 0,
  reviews: [
    {
      subReviews: [
        {
          review: {
            reviewId: "MP_WXS_3239545440_v1",
            createTime: 1754179200,
            mpInfo: { title: "文章一", originalId: "abc123" },
          },
        },
        {
          review: {
            reviewId: "MP_WXS_3239545440_v2",
            createTime: 1754179260,
            mpInfo: { title: "文章二" },
          },
        },
      ],
    },
  ],
};

const CONTENT_HTML = `<html><body><div id="js_content"><p>正文内容</p></div></body></html>`;

function mockFetch(routes: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      for (const [path, body] of Object.entries(routes)) {
        if (u.includes(path)) {
          return new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      throw new Error(`未 mock 的请求: ${u}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weread/shelf 直连路由", () => {
  it("拉取书架公众号文章列表并生成 RSS（过滤非公众号、提取正文）", async () => {
    mockFetch({
      "/web/shelf/sync": SHELF,
      "/web/mp/articles": ARTICLES,
      "/web/mp/content": CONTENT_HTML,
    });

    const handler = getRouteHandler("weread/shelf");
    if (!handler) throw new Error("weread/shelf 路由未注册");
    const result = await handler({
      params: {},
      cookies: "wr_vid=1; wr_skey=abc",
      abortSignal: new AbortController().signal,
      maxItems: 100,
    });

    expect(result.metadata?.itemCount).toBe(2);
    expect(result.rssXml).toContain("文章一");
    expect(result.rssXml).toContain("正文内容"); // 正文已提取
    expect(result.rssXml).toContain("https://mp.weixin.qq.com/s/abc123"); // 原文链接
    expect(result.rssXml).not.toContain("普通书籍");
  });

  it("seen_guids 增量去重：已入库文章不抓正文", async () => {
    mockFetch({
      "/web/shelf/sync": SHELF,
      "/web/mp/articles": ARTICLES,
      "/web/mp/content": CONTENT_HTML,
    });

    const handler = getRouteHandler("weread/shelf");
    if (!handler) throw new Error("weread/shelf 路由未注册");
    const result = await handler({
      params: { seen_guids: ["weread:MP_WXS_3239545440:MP_WXS_3239545440_v1"] },
      cookies: "wr_vid=1; wr_skey=abc",
      abortSignal: new AbortController().signal,
      maxItems: 100,
    });

    expect(result.metadata?.itemCount).toBe(1); // 只有 v2 新文章
    expect(result.rssXml).toContain("文章二");
    expect(result.rssXml).not.toContain("文章一");
  });

  it("书架为空时返回空 RSS 而非报错", async () => {
    mockFetch({
      "/web/shelf/sync": { errCode: 0, books: [] },
    });

    const handler = getRouteHandler("weread/shelf");
    if (!handler) throw new Error("weread/shelf 路由未注册");
    const result = await handler({
      params: {},
      cookies: "wr_vid=1",
      abortSignal: new AbortController().signal,
      maxItems: 100,
    });

    expect(result.metadata?.itemCount).toBe(0);
    expect(result.rssXml).toContain("书架中未发现订阅的公众号");
  });

  it("登录态失效（-2010）时抛出认证错误", async () => {
    mockFetch({
      "/web/shelf/sync": { errCode: -2010 },
    });

    const handler = getRouteHandler("weread/shelf");
    if (!handler) throw new Error("weread/shelf 路由未注册");
    await expect(
      handler({
        params: {},
        cookies: "wr_vid=1",
        abortSignal: new AbortController().signal,
        maxItems: 100,
      }),
    ).rejects.toThrow(/登录态已失效/);
  });

  it("书架接口返回风控错误（-2041）时显式报错而非静默空列表", async () => {
    mockFetch({
      "/web/shelf/sync": { errCode: -2041 },
    });

    const handler = getRouteHandler("weread/mps");
    if (!handler) throw new Error("weread/mps 路由未注册");
    await expect(
      handler({
        params: {},
        cookies: "wr_vid=1",
        abortSignal: new AbortController().signal,
        maxItems: 100,
      }),
    ).rejects.toThrow(/errCode=-2041/);
  });

  it("全部公众号文章接口失败时显式报错而非静默空列表", async () => {
    mockFetch({
      "/web/shelf/sync": SHELF,
      "/web/mp/articles": { errCode: -2041 },
    });

    const handler = getRouteHandler("weread/shelf");
    if (!handler) throw new Error("weread/shelf 路由未注册");
    await expect(
      handler({
        params: {},
        cookies: "wr_vid=1",
        abortSignal: new AbortController().signal,
        maxItems: 100,
      }),
    ).rejects.toThrow(/文章接口不可用/);
  });
});
