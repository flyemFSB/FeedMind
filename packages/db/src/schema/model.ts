import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 模型注册表：usage 承载运行时绑定（1:1 可选关系落在实体行上，删行即解绑）
export const model = sqliteTable(
  "model",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    apiModel: text("api_model").notNull().default(""),
    baseUrl: text("base_url").notNull().default(""),
    apiKey: text("api_key").notNull().default(""),
    contextWindow: integer("context_window"),
    maxOutput: integer("max_output"),
    usage: text("usage"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    check("ck_model_kind", sql`kind IN ('chat', 'embedding', 'ocr')`),
    check(
      "ck_model_usage",
      // drizzle-kit 会在换行处截断 CHECK 表达式，必须写成单行
      sql`usage IS NULL OR (kind = 'chat' AND usage IN ('chat', 'wiki')) OR (kind = 'ocr' AND usage = 'ocr') OR (kind = 'embedding' AND usage = 'embedding')`,
    ),
    uniqueIndex("uq_model_identity").on(t.kind, t.provider, t.apiModel, t.baseUrl),
    // 一个运行时用途至多绑定一个模型
    uniqueIndex("uq_model_usage")
      .on(t.usage)
      .where(sql`usage IS NOT NULL`),
  ],
);

export type ModelRow = typeof model.$inferSelect;
export type ModelInsert = typeof model.$inferInsert;
