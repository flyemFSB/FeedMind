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

describe("pickFreshItems 先去重后截断", () => {
  // 模拟 docs.langchain.com changelog：11 条中 4 条 pubDate 相同，最旧条目从未入库
  const items = [
    { guid: "g10", pubDate: "2026-07-24", title: "", description: "", link: "" },
    { guid: "g9", pubDate: "2026-05-29", title: "", description: "", link: "" },
    { guid: "g8", pubDate: "2026-05-12", title: "", description: "", link: "" },
    { guid: "g7", pubDate: "2026-04-07", title: "", description: "", link: "" },
    { guid: "g6", pubDate: "2026-03-10", title: "", description: "", link: "" },
    { guid: "g5", pubDate: "2026-02-12", title: "", description: "", link: "" },
    { guid: "g4", pubDate: "2026-02-12", title: "", description: "", link: "" },
    { guid: "g3", pubDate: "2026-02-12", title: "", description: "", link: "" },
    { guid: "g2", pubDate: "2026-02-12", title: "", description: "", link: "" },
    { guid: "g1", pubDate: "2026-02-12", title: "", description: "", link: "" },
    { guid: "g0", pubDate: "2026-02-12", title: "", description: "", link: "" },
  ];

  it("上游条目数超上限时，未入库的最旧条目不被已存在条目挤掉", () => {
    const seen = new Set(items.slice(0, 10).map((i) => i.guid));
    const fresh = pickFreshItems(items, seen, 10);
    expect(fresh.map((i) => i.guid)).toEqual(["g0"]);
  });

  it("全部已入库时不重复插入", () => {
    const fresh = pickFreshItems(
      items,
      items.map((i) => i.guid),
      10,
    );
    expect(fresh).toEqual([]);
  });

  it("新条目优先于旧条目，且受上限约束", () => {
    const seen = new Set(["g9", "g8"]);
    const fresh = pickFreshItems(items, seen, 3);
    expect(fresh.map((i) => i.guid)).toEqual(["g10", "g7", "g6"]);
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
