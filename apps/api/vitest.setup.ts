// vitest setup：api 模块在导入期就做 env 校验与读取（sharedEnv 要求 ENCRYPTION_KEY，
// isProduction 读 APP_ENV），测试无需真实 env 全量，先备好基础变量。
process.env["APP_ENV"] ??= "test";
process.env["ENCRYPTION_KEY"] ??= "test-encryption-key-not-secret";
