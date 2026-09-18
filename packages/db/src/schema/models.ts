import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 上下文窗口 / 最大输出：单位为 K tokens（64 → 64000 tokens），与前端 formatKB 一致。
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
    contextWindow: integer("context_window"), // 单位：千（K）tokens
    maxOutput: integer("max_output"), // 单位：千（K）tokens
    isSelected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => ({
    // 身份键不含密钥：轮换 API Key 不应产生「另一条模型」
    modelUniq: uniqueIndex("uq_model_type_provider_endpoint").on(
      table.type,
      table.provider,
      table.modelId,
      table.baseUrl,
    ),
    selectedPerType: uniqueIndex("uq_model_selected_per_type")
      .on(table.type)
      .where(sql`is_selected = 1`),
  }),
);

export type ModelRow = typeof model.$inferSelect;
export type ModelInsert = typeof model.$inferInsert;
