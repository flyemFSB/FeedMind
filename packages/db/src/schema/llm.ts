import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const llm = sqliteTable(
  "llm",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    modelName: text("model_name").notNull(),
    modelId: text("model_id").notNull().default(""),
    baseUrl: text("base_url").notNull().default(""),
    encryptedApiKey: text("encrypted_api_key").notNull().default(""),
    contextWindow: text("context_window"),
    maxOutput: text("max_output"),
    isSelected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    modelUniq: unique("uq_llm_model_endpoint_key").on(
      table.modelId,
      table.baseUrl,
      table.encryptedApiKey,
    ),
  }),
);

export type LLMRow = typeof llm.$inferSelect;
export type LLMInsert = typeof llm.$inferInsert;
