import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// cookie_store: 各平台明文 cookie 存储
export const cookieStore = sqliteTable(
  "cookie_store",
  {
    uuid: text("uuid").notNull(),
    platform: text("platform").notNull(),
    cookies: text("cookies").notNull(),
    // 登录态有效性：true=有效 / false=已失效 / null=未知（尚未校验）
    valid: integer("valid", { mode: "boolean" }),
    checkedAt: text("checked_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.uuid, t.platform] }),
  }),
);

export type CookieStoreRow = typeof cookieStore.$inferSelect;
