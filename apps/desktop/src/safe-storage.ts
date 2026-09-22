import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { safeStorage } from "electron";

const ENC_FILE = ".secret_key.enc";
const PLAIN_FILE = ".secret_key";

/** 初始化桌面端主密钥并返回潜在的密钥冲突告警 */
export function initDesktopEncryptionKey(dataDir: string): string | null {
  const { key, warning } = resolveMasterKey(dataDir);
  process.env["ENCRYPTION_KEY"] = key;
  return warning;
}

function resolveMasterKey(dataDir: string): { key: string; warning: string | null } {
  const encFile = path.join(dataDir, ENC_FILE);
  const plainFile = path.join(dataDir, PLAIN_FILE);
  const envKey = process.env["ENCRYPTION_KEY"]?.trim();
  const vaultAvailable = safeStorage.isEncryptionAvailable();

  if (envKey) {
    // 数据目录密钥才是既有密文的真实钥匙，二者不一致必须显式提示而非静默二选一
    let warning: string | null = null;
    if (vaultAvailable && existsSync(encFile)) {
      try {
        if (safeStorage.decryptString(readFileSync(encFile)) !== envKey) {
          warning =
            "ENCRYPTION_KEY 与数据目录主密钥不一致，本次运行以 ENCRYPTION_KEY 为准；如需使用数据目录主密钥请清空 .env 中的 ENCRYPTION_KEY";
        }
      } catch {
        // 保险箱不可解密时无从比对
      }
    }
    return { key: envKey, warning };
  }

  if (vaultAvailable) {
    if (existsSync(encFile)) {
      try {
        return { key: safeStorage.decryptString(readFileSync(encFile)), warning: null };
      } catch (err) {
        // 静默换新密钥会让库内已加密凭据永久不可解，必须显式失败
        throw new Error(
          "系统凭据保险箱无法解密主密钥，已加密的 API Key 将不可恢复；请在备份数据后删除 .secret_key.enc 重新配置",
          { cause: err },
        );
      }
    }

    try {
      // 读取未加密密钥并转存至系统安全凭据
      if (existsSync(plainFile)) {
        const key = readFileSync(plainFile, "utf-8").trim();
        writeFileSync(encFile, safeStorage.encryptString(key));
        rmSync(plainFile, { force: true });
        return { key, warning: null };
      }

      // 生成 32 字节随机主密钥并加密落盘
      const newKey = randomBytes(32).toString("hex");
      writeFileSync(encFile, safeStorage.encryptString(newKey));
      return { key: newKey, warning: null };
    } catch {
      // 凭据箱读写异常时降级至本地文件存储
    }
  }

  // 无系统凭据保险箱环境回退为本地文件存储
  try {
    return { key: readFileSync(plainFile, "utf-8").trim(), warning: null };
  } catch {
    const key = randomBytes(32).toString("hex");
    try {
      writeFileSync(plainFile, key, "utf-8");
    } catch {
      // 写入密钥文件失败时使用内存临时密钥
    }
    return { key, warning: null };
  }
}
