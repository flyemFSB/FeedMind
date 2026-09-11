import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { model } from "./models.ts";

// runtime 本身是业务主键（session | wiki，固定两行），不再保留无用自增 id。
export const runtimeConfig = sqliteTable("runtime_config", {
  runtime: text("runtime").primaryKey(),
  llmId: integer("llm_id").references(() => model.id, { onDelete: "set null" }),
  temperature: real("temperature").notNull().default(0.2),
  topP: real("top_p").notNull().default(1),
  systemPrompt: text("system_prompt").notNull().default(""),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export type RuntimeConfigRow = typeof runtimeConfig.$inferSelect;
