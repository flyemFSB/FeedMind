import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Wiki 全文索引的元数据：派生数据，updated_at 为毫秒时间戳（不适用业务惯例字段）
export const wikiFtsMeta = sqliteTable("wiki_fts_meta", {
  spaceId: text("space_id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type WikiFtsMetaRow = typeof wikiFtsMeta.$inferSelect;
