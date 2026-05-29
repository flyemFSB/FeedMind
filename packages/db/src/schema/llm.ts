import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const llm = pgTable("llm", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  modelName: text("model_name").notNull().unique(),
  baseUrl: text("base_url").notNull().default(""),
  encryptedApiKey: text("encrypted_api_key").notNull().default(""),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LLMRow = typeof llm.$inferSelect;
export type LLMInsert = typeof llm.$inferInsert;
