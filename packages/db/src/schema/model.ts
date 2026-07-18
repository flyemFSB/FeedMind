import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const model = sqliteTable(
  "model",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull().default("chat"),
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
    modelUniq: unique("uq_model_type_endpoint_key").on(
      table.type,
      table.modelId,
      table.baseUrl,
      table.encryptedApiKey,
    ),
  }),
);

export type ModelRow = typeof model.$inferSelect;
export type ModelInsert = typeof model.$inferInsert;
