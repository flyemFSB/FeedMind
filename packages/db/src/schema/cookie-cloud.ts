import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// cookie_cloud: CookieCloud 扩展同步的加密数据（UUID + 密码 + 加密 blob）。
// 扩展推送时解密写入 cookie_store；密码仅用于解密，不落明文 cookie。
export const cookieCloud = sqliteTable("cookie_cloud", {
  uuid: text("uuid").primaryKey(),
  password: text("password").notNull(),
  encrypted: text("encrypted").notNull(),
  cryptoType: text("crypto_type").notNull().default("legacy"),
});

export type CookieCloudRow = typeof cookieCloud.$inferSelect;
