import pino from "pino";
import { isProduction } from "@feedmind/env";
import { apiEnv } from "../env.js";
import { APP_NAME, APP_VERSION } from "./constants.js";

const usePretty = apiEnv.LOG_PRETTY === "1" || (!isProduction() && apiEnv.LOG_PRETTY !== "0");

const pinoOptions: pino.LoggerOptions = {
  level: apiEnv.LOG_LEVEL ?? (isProduction() ? "info" : "debug"),
  // pino 默认 epoch 毫秒数字，改 ISO8601 便于阅读与日志平台解析；dev 下 pino-pretty 自行重排不受影响
  timestamp: pino.stdTimeFunctions.isoTime,
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
      "appSecret",
      "app_secret",
      "token",
      "secret",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.cookies",
      "*.appSecret",
      "*.app_secret",
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
};

function createLogger(): pino.Logger {
  if (usePretty) {
    try {
      return pino({
        ...pinoOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname,service,env,version",
          },
        },
      });
    } catch {
      // 在打包、Worker 或环境缺失 pino-pretty 时降级至标准输出
    }
  }
  return pino(pinoOptions, process.stdout);
}

// 显式传 process.stdout 走 Node 原生宽字符通道，避免 Windows 控制台乱码
export const logger = createLogger();
