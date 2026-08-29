import pino from "pino";

// db 包独立 logger（工具脚本/包外使用不依赖 api），保持与 api 侧同款脱敏防线：
// 数据库行/错误对象可能携带 cookies/apiKey 等敏感字段，明文进日志即安全事件
export const dbLogger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  // 与 api 侧 logger 对齐 ISO8601 时间戳：epoch 毫秒在 pretty 控制台混排时不可读
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: "feedmind-db" },
  redact: {
    paths: [
      "apiKey",
      "api_key",
      "password",
      "cookies",
      "authorization",
      "appSecret",
      "app_secret",
      "token",
      "secret",
      "*.apiKey",
      "*.password",
      "*.cookies",
      "*.appSecret",
      "*.token",
      "*.secret",
      "*.*apiKey",
      "*.*password",
      "*.*cookies",
      "*.*token",
      "*.*secret",
    ],
    censor: "[REDACTED]",
  },
});
