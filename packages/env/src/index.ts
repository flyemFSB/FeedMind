// 共享环境变量（所有应用）
export { sharedEnv } from "./shared.js";

// API 服务端环境变量
export { apiEnv } from "./api.js";

// 工具函数
export { isProduction, requireEncryptionKey } from "./utils.js";
