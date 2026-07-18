import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { model } from "./model.js";

export const runtimeConfig = sqliteTable("runtime_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runtime: text("runtime").notNull().unique(), // "session" | "wiki"
  llmId: integer("llm_id").references(() => model.id, { onDelete: "set null" }),
  temperature: real("temperature").notNull().default(0.2),
  topP: real("top_p").notNull().default(1),
  systemPrompt: text("system_prompt").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export type RuntimeConfigRow = typeof runtimeConfig.$inferSelect;
export type RuntimeConfigInsert = typeof runtimeConfig.$inferInsert;
