import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";

// CookieCloud 扩展配置表：存储同步凭据与密文
export const cookieCloud = sqliteTable(
  "cookie_cloud",
  {
    uuid: text("uuid").primaryKey(),
    password: text("password").notNull(),
    encrypted: text("encrypted").notNull(),
    cryptoType: text("crypto_type").notNull().default("legacy"),
  },
  () => ({
    cryptoTypeCheck: check(
      "ck_cookie_cloud_crypto_type",
      sql`crypto_type IN ('legacy', 'aes-128-cbc-fixed')`,
    ),
  }),
);

export type CookieCloudRow = typeof cookieCloud.$inferSelect;
