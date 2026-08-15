import { describe, it, expect } from "vitest";
import { parseRssXml, pickFreshItems } from "./service.js";
import { stripWww, shouldBackfillTitle } from "../rss-sources/service.js";

// parseRssXml 直接操作 DB 模块的模块级 db 引用？——不，parseRssXml 本身不碰 DB，可独立测
describe("parseRssXml 空标题兜底", () => {
  it("title 为空串时回退到 link slug，而非兜底占位符", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>LangChain Blog</title>
  <item>
    <title></title>
    <link>https://www.langchain.com/blog/building-monday-com-sidekick-why-capable-agents-need-more-than-just-tools</link>
    <guid>https://www.langchain.com/blog/building-monday-com-sidekick</guid>
    <description></description>
    <pubDate>Tue, 11 Aug 2026 22:44:30 GMT</pubDate>
  </item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe(
      "building monday com sidekick why capable agents need more than just tools",
    );
  });

  it("title 与 link slug 都缺失时兜底占位符", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title></title>
    <link></link>
    <guid>g1</guid>
  </item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe("(无标题)");
  });

  it("正常 title 不受影响", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>  Normal Title  </title><link>https://example.com/a</link><guid>g2</guid></item>
</channel></rss>`;
    const { items } = await parseRssXml(xml);
    expect(items[0]?.title).toBe("Normal Title");
  });
});

describe("pickFreshItems 按库内最新时间戳增量", () => {
  const items = [
    { guid: "a", pubDate: "2026-08-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "b", pubDate: "2026-07-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "c", pubDate: "2026-06-01T00:00:00Z", title: "", description: "", link: "" },
    { guid: "d", pubDate: null, title: "", description: "", link: "" },
  ];

  it("只接受比库内最新 feed 更新的条目", () => {
    const fresh = pickFreshItems(items, "2026-07-15T00:00:00Z", 10);
    expect(fresh.map((i) => i.guid)).toEqual(["a"]);
  });

  // 核心回归：源返回的前 10 条都是已入库的旧条目时，不得继续灌第 11 条起的更旧历史
  it("没有比库内最新更新的条目时返回空，不反复灌历史", () => {
    const fresh = pickFreshItems(items, "2026-08-01T00:00:00Z", 10);
    expect(fresh).toEqual([]);
  });

  it("首次同步（无阈值）全量接受前 maxItems 条", () => {
    const fresh = pickFreshItems(items, null, 2);
    expect(fresh.map((i) => i.guid)).toEqual(["a", "b"]);
  });

  it("阈值存在时无 pubDate 条目被拒绝，新条目受上限约束", () => {
    const fresh = pickFreshItems(items, "2026-01-01T00:00:00Z", 1);
    expect(fresh.map((i) => i.guid)).toEqual(["a"]);
  });
});

describe("stripWww / shouldBackfillTitle", () => {
  it("去掉 www 前缀", () => {
    expect(stripWww("www.langchain.com")).toBe("langchain.com");
    expect(stripWww("docs.langchain.com")).toBe("docs.langchain.com");
  });

  it("域名兜底形态（含旧数据带 www）可回填，手动改名不可回填", () => {
    expect(shouldBackfillTitle("www.langchain.com", "https://www.langchain.com/blog/rss.xml")).toBe(
      true,
    );
    expect(shouldBackfillTitle("langchain.com", "https://www.langchain.com/blog/rss.xml")).toBe(
      true,
    );
    expect(
      shouldBackfillTitle("docs.langchain.com", "https://docs.langchain.com/oss/rss.xml"),
    ).toBe(true);
    expect(shouldBackfillTitle("我的收藏", "https://www.langchain.com/blog/rss.xml")).toBe(false);
  });
});
