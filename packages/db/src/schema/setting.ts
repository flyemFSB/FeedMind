import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 单例配置域：每个键一份配置文档，保存即整体覆盖 */
export const SETTING_KEYS = [
  "cookie_cloud",
  "platform_cookie",
  "remote_connection",
  "report_schedule",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const setting = sqliteTable(
  "setting",
  {
    key: text("key").$type<SettingKey>().primaryKey(),
    value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  () => [
    // 键拼错即约束报错，不会静默读到默认值
    check(
      "ck_setting_key",
      sql`key IN ('cookie_cloud', 'platform_cookie', 'remote_connection', 'report_schedule')`,
    ),
    check("ck_setting_value", sql`json_valid(value)`),
  ],
);

export type SettingRow = typeof setting.$inferSelect;
export type SettingInsert = typeof setting.$inferInsert;
