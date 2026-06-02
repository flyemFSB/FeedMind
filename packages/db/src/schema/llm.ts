import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const llm = sqliteTable("llm", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  modelName: text("model_name").notNull().unique(),
  baseUrl: text("base_url").notNull().default(""),
  encryptedApiKey: text("encrypted_api_key").notNull().default(""),
  isSelected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export type LLMRow = typeof llm.$inferSelect;
export type LLMInsert = typeof llm.$inferInsert;