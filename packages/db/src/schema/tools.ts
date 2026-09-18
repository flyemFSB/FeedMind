import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 工具配置：icon 曾长期 NULL 且 UI 不用，已删除；图标由前端按 name 映射。
export const tools = sqliteTable("tools", {
  name: text("name").primaryKey(),
  category: text("category").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  configFields: text("config_fields").notNull(), // ConfigField[] 配置项定义的 JSON 字符串
  config: text("config").notNull().default("{}"), // 工具具体配置 JSON；密码等敏感字段经应用层 Fernet 加密存储
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export type ToolRow = typeof tools.$inferSelect;
