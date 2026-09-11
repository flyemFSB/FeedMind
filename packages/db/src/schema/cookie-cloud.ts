import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";

// cookie_cloud: CookieCloud 扩展配置（UUID + Fernet 密码 + 加密 blob）。
// 扩展推送时用密码解密后写入 cookie_store；密码本身 Fernet 落库。
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
