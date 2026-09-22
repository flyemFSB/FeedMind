/** 运行时校验主密钥，延迟至调用期以支持桌面端异步注入 */
export function requireEncryptionKey(): string {
  const key = (process.env["ENCRYPTION_KEY"] ?? "").trim();
  if (!key) {
    throw new Error("ENCRYPTION_KEY 未配置，请在启动服务前于 .env 中配置");
  }
  return key;
}
