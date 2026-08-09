import { z } from "zod/v4";

// ─── 枚举 ───────────────────────────────────────────────────────
export const PlatformId = z.enum([
  "feishu",
  "xiaohongshu",
  "douyin",
  "bilibili",
  "zhihu",
  "weread",
]);
export type PlatformId = z.infer<typeof PlatformId>;

export const ConnectionStatus = z.enum(["disconnected", "connecting", "connected", "error"]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

// ─── Feishu OAuth config ───────────────────────────────────────
export const feishuConfigSchema = z.object({
  appId: z.string(),
  appSecret: z.string(),
  verificationToken: z.string().optional(),
  encryptKey: z.string().optional(),
  // OAuth 令牌
  tenantAccessToken: z.string().optional(),
  tokenExpiresAt: z.number().optional(),
  // 用户绑定
  feishuUserId: z.string().optional(),
  feishuOpenId: z.string().optional(),
  feishuUnionId: z.string().optional(),
  userName: z.string().optional(),
  avatarUrl: z.string().optional(),
  // Webhook 地址
  webhookUrl: z.string().optional(),
});
export type FeishuConfig = z.infer<typeof feishuConfigSchema>;

// ─── 社交平台 Cookie 配置 ────────────────────────────────────
export const cookieConfigSchema = z.object({
  cookies: z.string().optional(),
  proxyUrl: z.string().optional(),
});
export type CookieConfig = z.infer<typeof cookieConfigSchema>;

// ─── 统一远程连接 schema ──────────────────────────────────
export const remoteConnectionSchema = z.object({
  id: z.string(),
  platform: PlatformId,
  label: z.string(),
  status: ConnectionStatus,
  config: z.any().nullable(),
  extra: z.any().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RemoteConnection = z.infer<typeof remoteConnectionSchema>;

export const remoteConnectionListSchema = z.object({
  data: z.array(remoteConnectionSchema),
});
export type RemoteConnectionList = z.infer<typeof remoteConnectionListSchema>;

// ─── Create / Update payload ───────────────────────────────────
export const remoteConnectionUpsertSchema = z.object({
  platform: PlatformId,
  label: z.string().min(1).max(100),
  config: z.any().optional(),
});
export type RemoteConnectionUpsert = z.infer<typeof remoteConnectionUpsertSchema>;

// ─── Feishu OAuth ──────────────────────────────────────────────
export const feishuAuthUrlResponseSchema = z.object({
  authUrl: z.string().url(),
});
export type FeishuAuthUrlResponse = z.infer<typeof feishuAuthUrlResponseSchema>;

export const feishuCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});
export type FeishuCallbackQuery = z.infer<typeof feishuCallbackQuerySchema>;
