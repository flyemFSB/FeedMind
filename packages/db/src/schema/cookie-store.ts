import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 各平台 Cookie 存储表：敏感凭据在应用层加密落库
export const cookieStore = sqliteTable(
  "cookie_store",
  {
    uuid: text("uuid").notNull(),
    platform: text("platform").notNull(),
    cookies: text("cookies").notNull(),
    // 登录态：true=有效 / false=已失效 / null=未知（尚未校验）
    valid: integer("valid", { mode: "boolean" }),
    checkedAt: text("checked_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.uuid, t.platform] }),
    platformIdx: index("idx_cookie_store_platform").on(t.platform),
  }),
);

export type CookieStoreRow = typeof cookieStore.$inferSelect;
