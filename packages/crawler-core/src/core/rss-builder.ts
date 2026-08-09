/**
 * RSS 2.0 XML 构建工具
 *
 * 从结构化数据生成合法的 RSS 2.0 XML。
 * 遵循 RSS 2.0 规范: https://validator.w3.org/feed/docs/rss2.html
 */

export interface RssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
  author?: string;
  category?: string[];
  enclosure_url?: string;
  enclosure_type?: string;
  /** 封面图 URL（输出 RSS 时映射为 &lt;enclosure&gt;） */
  image?: string;
}

export interface RssFeed {
  title: string;
  link: string;
  description: string;
  language?: string;
  ttl?: number;
  items: RssItem[];
}

const DEFAULT_LANGUAGE = "zh-CN";
const DEFAULT_TTL = 60;

/**
 * XML 特殊字符转义（<, >, &, ", ' → 实体引用）。
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 用 CDATA 包裹文本，适用于 RSS <description> 中含 HTML 的场景。
 */
function cdata(text: string): string {
  // 转义 CDATA 关闭标记 ]]>，防止提前截断
  const safe = text.replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

/**
 * 格式化日期为 RFC 2822 字符串（RSS 2.0 pubDate 要求）。
 * 支持 ISO 8601、Unix 时间戳（秒/毫秒）、Date 对象。
 */
export function toRfc2822(date: string | number | Date): string {
  const d = typeof date === "string" ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return new Date().toUTCString();
  }
  return d.toUTCString();
}

/**
 * Unix 时间戳（秒）转 RFC 2822 格式。
 */
export function fromUnixTimestamp(seconds: number): string {
  return toRfc2822(seconds * 1000);
}

export function buildRssXml(feed: RssFeed): string {
  const lang = feed.language ?? DEFAULT_LANGUAGE;
  const ttl = feed.ttl ?? DEFAULT_TTL;

  const itemsXml = feed.items
    .map((item) => {
      const cats = (item.category ?? [])
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join("\n");

      const enclosure =
        item.enclosure_url && item.enclosure_type
          ? `      <enclosure url="${escapeXml(item.enclosure_url)}" type="${escapeXml(item.enclosure_type)}" />`
          : "";

      const imageEnclosure = item.image
        ? `      <enclosure url="${escapeXml(item.image)}" type="image/jpeg" />`
        : "";

      return `    <item>
      <title>${cdata(item.title)}</title>
      <description>${cdata(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      ${item.author ? `      <author>${escapeXml(item.author)}</author>` : ""}
${cats}${enclosure}${imageEnclosure}    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${cdata(feed.title)}</title>
    <link>${escapeXml(feed.link)}</link>
    <description>${cdata(feed.description)}</description>
    <language>${lang}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>${ttl}</ttl>
    <atom:link href="${escapeXml(feed.link)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

export function buildGuid(platform: string, contentId: string): string {
  return `${platform}:${contentId}`;
}
