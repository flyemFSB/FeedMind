import { sharedEnv } from "./shared.js";

export function isProduction(appEnv?: string): boolean {
  const env = (appEnv ?? sharedEnv.APP_ENV).trim().toLowerCase();
  return ["prod", "production"].includes(env);
}

export function requireEncryptionKey(): string {
  const key = sharedEnv.ENCRYPTION_KEY.trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set. Configure it in .env before starting the server.");
  }
  return key;
}
