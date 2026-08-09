import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tools = sqliteTable("tools", {
  name: text("name").primaryKey(),
  category: text("category").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  icon: text("icon"),
  configFields: text("config_fields").notNull(), // JSON string of ConfigField[]
  config: text("config").notNull().default("{}"), // JSON string of record
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type ToolRow = typeof tools.$inferSelect;
