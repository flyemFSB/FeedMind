import { z } from "zod";

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

// ─── 飞书应用凭证配置 ───────────────────────────────────────
export type FeishuConfig = {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
  tenantAccessToken?: string;
  tokenExpiresAt?: number;
  feishuUserId?: string;
  feishuOpenId?: string;
  feishuUnionId?: string;
  userName?: string;
  avatarUrl?: string;
  webhookUrl?: string;
};

// ─── 社交平台 Cookie 配置 ────────────────────────────────────
export type CookieConfig = {
  cookies?: string;
  proxyUrl?: string;
};

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
export type RemoteConnectionList = { data: RemoteConnection[] };

// ─── 连接创建与更新载荷 ───────────────────────────────────────
export const remoteConnectionUpsertSchema = z.object({
  platform: PlatformId,
  label: z.string().min(1).max(100),
  config: z.any().optional(),
});
export type RemoteConnectionUpsert = z.infer<typeof remoteConnectionUpsertSchema>;

// ─── 飞书 OAuth 授权 ──────────────────────────────────────────
export type FeishuAuthUrlResponse = { authUrl: string };
export type FeishuCallbackQuery = { code: string; state?: string };
