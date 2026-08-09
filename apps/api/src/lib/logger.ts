import pino from "pino";
import { isProduction } from "@feedmind/env";
import { apiEnv } from "../env.js";
import { APP_NAME, APP_VERSION } from "./constants.js";

const devTransport = isProduction()
  ? {}
  : {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname,service,env,version",
        },
      },
    };

export const logger = pino({
  level: apiEnv.LOG_LEVEL ?? (isProduction() ? "info" : "debug"),
  // pino 默认 epoch 毫秒数字，改 ISO8601 便于阅读与日志平台解析；dev 下 pino-pretty 自行重排不受影响
  timestamp: pino.stdTimeFunctions.isoTime,
  ...devTransport,
  base: {
    service: APP_NAME,
    env: apiEnv.APP_ENV,
    // 版本号是生产排障时对回构建的唯一锚点（多版本部署靠它定位是哪次发布在报错）
    version: APP_VERSION,
  },
  redact: {
    paths: [
      "apiKey",
      "api_key",
      "password",
      "cookies",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.password",
      "*.cookies",
    ],
    censor: "[REDACTED]",
  },
});
