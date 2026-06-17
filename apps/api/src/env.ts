/**
 * API 环境变量入口。
 * 统一从 @feedmind/env 加载和校验。
 */
import { apiEnv, requireEncryptionKey } from "@feedmind/env";

/** 类型安全的 API 环境变量对象（启动时校验） */
export { apiEnv };

/** API 启动时运行的环境校验 */
export function validateApiRuntime(): void {
  requireEncryptionKey();
}
