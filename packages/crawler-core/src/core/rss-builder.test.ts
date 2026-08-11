import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RssFeed } from "./rss-builder.js";
import { buildGuid, buildRssXml, fromUnixTimestamp, toRfc2822 } from "./rss-builder.js";

const FIXED_NOW = new Date("2026-08-09T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("toRfc2822", () => {
  it("ISO 字符串与毫秒时间戳转 RFC 2822", () => {
    expect(toRfc2822("2026-08-09T00:00:00.000Z")).toBe("Sun, 09 Aug 2026 00:00:00 GMT");
    expect(toRfc2822(1754179200000)).toBe("Sun, 03 Aug 2025 00:00:00 GMT");
  });

  it("无效日期回退到当前时间", () => {
    expect(toRfc2822("not-a-date")).toBe("Sun, 09 Aug 2026 00:00:00 GMT");
  });
});

describe("fromUnixTimestamp", () => {
  it("秒级时间戳转换", () => {
    expect(fromUnixTimestamp(1754179200)).toBe("Sun, 03 Aug 2025 00:00:00 GMT");
  });
});

describe("buildGuid", () => {
  it("按平台与内容 ID 拼装", () => {
    expect(buildGuid("bilibili", "BV123")).toBe("bilibili:BV123");
  });
});

describe("buildRssXml", () => {
  const feed: RssFeed = {
    title: "示例源 <新>",
    link: "https://example.com/feed",
    description: "描述 & 内容",
    items: [
      {
        title: "标题 <带标签>",
        description: "正文含 ]]> 序列与 & 符号",
        link: "https://example.com/post?q=1&x=2",
        guid: "bilibili:BV1",
        pubDate: "Sun, 09 Aug 2026 00:00:00 GMT",
        author: "作者 <A>",
        category: ["科技", "AI & ML"],
        image: "https://img.example.com/cover.jpg",
      },
    ],
  };

  it("默认 language 与 ttl", () => {
    const xml = buildRssXml(feed);
    expect(xml).toContain("<language>zh-CN</language>");
    expect(xml).toContain("<ttl>60</ttl>");
  });

  it("link/author/category/guid 做 XML 转义，title/description 走 CDATA", () => {
    const xml = buildRssXml(feed);
    expect(xml).toContain("<link>https://example.com/post?q=1&amp;x=2</link>");
    expect(xml).toContain("作者 &lt;A&gt;");
    expect(xml).toContain("<category>AI &amp; ML</category>");
    // CDATA 字段内特殊字符保持字面量
    expect(xml).toContain("<title><![CDATA[标题 <带标签>]]></title>");
    expect(xml).toContain("<description><![CDATA[描述 & 内容]]></description>");
  });

  it("description 用 CDATA 包裹且转义 CDATA 闭合序列，& 保持字面量", () => {
    const xml = buildRssXml(feed);
    expect(xml).toContain("<![CDATA[正文含 ]]]]><![CDATA[> 序列与 & 符号]]>");
  });

  it("image 映射为 image/jpeg 的 enclosure", () => {
    const xml = buildRssXml(feed);
    expect(xml).toContain(
      '<enclosure url="https://img.example.com/cover.jpg" type="image/jpeg" />',
    );
  });

  it("结构完整：XML 声明、channel、item、atom:link", () => {
    const xml = buildRssXml(feed);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<item>");
    expect(xml).toContain('<guid isPermaLink="false">bilibili:BV1</guid>');
    expect(xml).toContain('rel="self" type="application/rss+xml"');
  });
});
