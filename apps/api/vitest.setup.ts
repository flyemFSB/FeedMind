import { tmpdir } from "node:os";
import { join } from "node:path";

// 测试环境初始化：预置 API 模块加载所需的最小环境变量
process.env["APP_ENV"] ??= "test";
process.env["ENCRYPTION_KEY"] ??= "test-encryption-key-not-secret";
process.env["DATA_DIR"] ??= join(tmpdir(), "feedmind-test-data");
