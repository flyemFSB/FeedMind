import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { llm } from "./llm.js";

export const runtimeConfig = sqliteTable("runtime_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scenario: text("scenario").notNull().unique(), // "session" | "wiki"
  llmId: integer("llm_id").references(() => llm.id, { onDelete: "set null" }),
  temperature: real("temperature").notNull().default(0.2),
  maxOutputTokens: integer("max_output_tokens").notNull().default(16384),
  topP: real("top_p").notNull().default(1),
  contextLength: text("context_length").notNull().default("128k"),
  systemPrompt: text("system_prompt").notNull().default(""),
  updatedAt: text("updated_at")
    .notNull()
    .default(""),
});

export type RuntimeConfigRow = typeof runtimeConfig.$inferSelect;
export type RuntimeConfigInsert = typeof runtimeConfig.$inferInsert;
