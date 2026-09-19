import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { safeStorage } from "electron";

/** 优先利用操作系统凭据保险箱加密存储桌面端主密钥 */
export function initDesktopEncryptionKey(dataDir: string): void {
  if (process.env["ENCRYPTION_KEY"]?.trim()) return;

  const encFile = path.join(dataDir, ".secret_key.enc");
  const plainFile = path.join(dataDir, ".secret_key");

  // 操作系统底层凭据保护可用时优先使用安全存储
  if (safeStorage.isEncryptionAvailable()) {
    try {
      if (existsSync(encFile)) {
        const encrypted = readFileSync(encFile);
        process.env["ENCRYPTION_KEY"] = safeStorage.decryptString(encrypted);
        return;
      }

      // 读取未加密密钥并转存至系统安全凭据
      if (existsSync(plainFile)) {
        const key = readFileSync(plainFile, "utf-8").trim();
        const encrypted = safeStorage.encryptString(key);
        writeFileSync(encFile, encrypted);
        rmSync(plainFile, { force: true });
        process.env["ENCRYPTION_KEY"] = key;
        return;
      }

      // 生成 32 字节随机主密钥并加密落盘
      const newKey = randomBytes(32).toString("hex");
      writeFileSync(encFile, safeStorage.encryptString(newKey));
      process.env["ENCRYPTION_KEY"] = newKey;
      return;
    } catch {
      // 异常时降级至普通文件存储
    }
  }

  // 无系统凭据保险箱环境回退为本地文件存储
  try {
    process.env["ENCRYPTION_KEY"] = readFileSync(plainFile, "utf-8").trim();
  } catch {
    const key = randomBytes(32).toString("hex");
    try {
      writeFileSync(plainFile, key, "utf-8");
    } catch {
      // 写入密钥文件失败时使用内存临时密钥
    }
    process.env["ENCRYPTION_KEY"] = key;
  }
}
