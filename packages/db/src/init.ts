import { migrate } from "drizzle-orm/libsql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { client, closeDb, db } from "./client.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(thisDir, "..", "drizzle");

const SEED_TOOLS = [
  {
    name: "web_search",
    category: "search",
    display_name: "搜索引擎",
    description: "搜索互联网获取最新信息。未配置 API Key 时自动使用 AnySearch 匿名模式兜底。",
    config_fields: JSON.stringify([
      { key: "tavilyApiKey", type: "password", label: "Tavily API Key", description: "从 Tavily 获取", link: "https://tavily.com" },
      { key: "exaApiKey", type: "password", label: "Exa API Key", description: "从 Exa 获取", link: "https://exa.ai" },
      { key: "anysearchApiKey", type: "password", label: "AnySearch API Key", description: "从 AnySearch 获取（留空则自动使用匿名模式）", link: "https://www.anysearch.com/console/api-keys" },
    ]),
    is_enabled: true,
    sort_order: 0,
  },
  {
    name: "web_fetch",
    category: "utility",
    display_name: "网页抓取",
    description: "抓取网页内容并提取正文。",
    config_fields: JSON.stringify([
      { key: "firecrawlApiKey", type: "password", label: "Firecrawl API Key", description: "从 Firecrawl 获取（留空则自动使用直接抓取兜底）", link: "https://www.firecrawl.dev/" },
    ]),
    is_enabled: true,
    sort_order: 1,
  },
];

export async function initDatabase(): Promise<void> {
  await migrate(db, { migrationsFolder });

  for (const tool of SEED_TOOLS) {
    // 首次写入：insert or ignore 按 name 主键去重
    await client.execute({
      sql: `insert or ignore into tools (name, category, display_name, description, config_fields, is_enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)`,
      args: [tool.name, tool.category, tool.display_name, tool.description, tool.config_fields, tool.is_enabled, tool.sort_order],
    });

    // 已有行更新：仅刷新 config_fields 和 description，不触碰 config（用户已设的 API Key）
    await client.execute({
      sql: `update tools set config_fields = ?, description = ? where name = ?`,
      args: [tool.config_fields, tool.description, tool.name],
    });
  }

  // 确保默认场景配置行存在
  for (const scenario of ["session", "wiki"]) {
    await client.execute({
      sql: `insert or ignore into runtime_config (scenario, temperature, max_output_tokens, top_p, context_length, system_prompt) values (?, ?, ?, ?, ?, ?)`,
      args: [scenario, 0.2, 8192, 1, "128k", ""],
    });
  }

  console.log("[db] Migrations applied, tools seeded.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await initDatabase();
  closeDb();
}
