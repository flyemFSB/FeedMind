import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 工具配置：展示元数据由代码目录提供，这里只存用户可编辑的开关与配置
export const toolConfig = sqliteTable(
  "tool_config",
  {
    name: text("name").primaryKey(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    config: text("config", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
  },
  () => [
    check("ck_tool_config_enabled", sql`enabled IN (0, 1)`),
    check("ck_tool_config_json", sql`json_valid(config)`),
  ],
);

export type ToolConfigRow = typeof toolConfig.$inferSelect;
export type ToolConfigInsert = typeof toolConfig.$inferInsert;
