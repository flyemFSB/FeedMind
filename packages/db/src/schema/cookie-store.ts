import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

// cookie_cloud: CookieCloud 加密数据存储（UUID + 密码 + 加密 blob）
export const cookieCloud = sqliteTable("cookie_cloud", {
  uuid: text("uuid").primaryKey(),
  password: text("password").notNull(),
  encrypted: text("encrypted").notNull(),
  cryptoType: text("crypto_type").notNull().default("legacy"),
});

export type CookieCloudRow = typeof cookieCloud.$inferSelect;

// cookie_store: 各平台明文 cookie 存储
export const cookieStore = sqliteTable(
  "cookie_store",
  {
    uuid: text("uuid").notNull(),
    platform: text("platform").notNull(),
    cookies: text("cookies").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.uuid, t.platform] }),
  }),
);

export type CookieStoreRow = typeof cookieStore.$inferSelect;
