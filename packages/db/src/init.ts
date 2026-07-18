import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { client, closeDb } from "./client.js";
import { dbLogger } from "./logger.js";

const SEED_TOOLS = [
  {
    name: "web_search",
    category: "search",
    display_name: "搜索引擎",
    description: "搜索互联网获取最新信息。未配置 API Key 时自动使用 AnySearch 匿名模式兜底。",
    config_fields: JSON.stringify([
      {
        key: "tavilyApiKey",
        type: "password",
        label: "Tavily API Key",
        description: "从 Tavily 获取",
        link: "https://tavily.com",
      },
      {
        key: "exaApiKey",
        type: "password",
        label: "Exa API Key",
        description: "从 Exa 获取",
        link: "https://exa.ai",
      },
      {
        key: "anysearchApiKey",
        type: "password",
        label: "AnySearch API Key",
        description: "从 AnySearch 获取（留空则自动使用匿名模式）",
        link: "https://www.anysearch.com/console/api-keys",
      },
    ]),
    is_enabled: true,
    sort_order: 0,
  },
  {
    name: "web_fetch",
    category: "utility",
    display_name: "网页抓取",
    description: "抓取网页内容。使用 Firecrawl 引擎，未配置 API Key 时自动使用匿名模式。",
    config_fields: JSON.stringify([
      {
        key: "firecrawlApiKey",
        type: "password",
        label: "Firecrawl API Key",
        description: "从 Firecrawl 获取（留空则使用匿名模式）",
        link: "https://www.firecrawl.dev/",
      },
    ]),
    is_enabled: true,
    sort_order: 1,
  },
];

export async function initDatabase(): Promise<void> {
  // 注意：表结构由 `pnpm run db:push`（drizzle-kit push）同步，本脚本仅负责种子数据

  for (const tool of SEED_TOOLS) {
    await client.execute({
      sql: `insert or ignore into tools (name, category, display_name, description, config_fields, is_enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        tool.name,
        tool.category,
        tool.display_name,
        tool.description,
        tool.config_fields,
        tool.is_enabled,
        tool.sort_order,
      ],
    });

    await client.execute({
      sql: `update tools set config_fields = ?, description = ? where name = ?`,
      args: [tool.config_fields, tool.description, tool.name],
    });
  }

  for (const runtime of ["session", "wiki"]) {
    await client.execute({
      sql: `insert or ignore into runtime_config (runtime, temperature, top_p, system_prompt) values (?, ?, ?, ?)`,
      args: [runtime, 0.2, 1, ""],
    });
  }

  dbLogger.info("数据库种子数据写入完成（表结构请先执行 pnpm run db:push）");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await initDatabase();
  closeDb();
}
