import type { ConfigField } from "@feedmind/contracts";

/**
 * 工具目录：展示元数据归代码所有（随工具实现一起版本化），
 * 数据库只存用户可编辑的开关与配置值。
 */
export interface ToolCatalogEntry {
  name: string;
  category: string;
  displayName: string;
  description: string;
  configFields: ConfigField[];
  enabledByDefault: boolean;
  sortOrder: number;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "web_search",
    category: "search",
    displayName: "搜索引擎",
    description: "搜索互联网获取最新信息。未配置 API Key 时自动使用 AnySearch 匿名模式兜底。",
    enabledByDefault: true,
    sortOrder: 0,
    configFields: [
      {
        key: "tavilyApiKey",
        type: "password",
        label: "Tavily API Key",
        description: "从 Tavily 获取",
        link: "https://tavily.com",
        required: false,
      },
      {
        key: "exaApiKey",
        type: "password",
        label: "Exa API Key",
        description: "从 Exa 获取",
        link: "https://exa.ai",
        required: false,
      },
      {
        key: "anysearchApiKey",
        type: "password",
        label: "AnySearch API Key",
        description: "从 AnySearch 获取（留空则自动使用匿名模式）",
        link: "https://www.anysearch.com/console/api-keys",
        required: false,
      },
    ],
  },
  {
    name: "web_fetch",
    category: "utility",
    displayName: "网页抓取",
    description: "抓取网页内容。使用 Firecrawl 引擎，未配置 API Key 时自动使用匿名模式。",
    enabledByDefault: true,
    sortOrder: 1,
    configFields: [
      {
        key: "firecrawlApiKey",
        type: "password",
        label: "Firecrawl API Key",
        description: "从 Firecrawl 获取（留空则使用匿名模式）",
        link: "https://www.firecrawl.dev/",
        required: false,
      },
    ],
  },
  {
    name: "fish_tts",
    category: "utility",
    displayName: "Fish 配音",
    description:
      "日报视频配音（Fish Audio 在线 TTS）。配置 API Key 后优先使用，否则回退 edge-tts。",
    enabledByDefault: true,
    sortOrder: 2,
    configFields: [
      {
        key: "apiKey",
        type: "password",
        label: "Fish Audio API Key",
        description: "从 fish.audio 获取（免费模型 s2.1-pro-free）",
        link: "https://fish.audio/",
        required: false,
      },
    ],
  },
];

export function findToolEntry(name: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((entry) => entry.name === name);
}
