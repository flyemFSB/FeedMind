import pino from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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

// 控制台美化：pino-pretty 以「进程内 stream」方式使用（非 worker transport）——
// transport 的 thread-stream 在打包/Worker 环境动态 require 模块会失败（它不在
// electron-builder 白名单内），进程内 stream 随 esbuild bundle 一起打入任何环境一致生效。
// pino-pretty 是 devDependency：生产 api 独立运行时不可用，动态 import 失败静默降级。
async function createPrettyStream(): Promise<pino.DestinationStream> {
  const { default: pretty } = await import("pino-pretty");
  return pretty({
    colorize: true,
    translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
    ignore: "pid,hostname",
    levelFirst: true,
    // 多行模式：字段逐个换行输出，比单行 JSON 易扫读（v13 默认即多行）
    singleLine: false,
    customPrettifiers: {
      // 级别标签等宽对齐（DEBUG/INFO /WARN /ERROR），默认长短不一难竖向扫读
      level: (_logLevel, _key, _log, { labelColorized }) => `${labelColorized.padEnd(6)}`,
    },
  });
}

async function initLogger(): Promise<pino.Logger> {
  // 桌面端（打包）落盘：GUI 无控制台，stdout 的日志行没有任何消费者；
  // LOG_FILE 由 desktop env-bootstrap 指向 %APPDATA%/FeedMind/logs/app.log，
  // 文件保持原生 JSON 行（机器可解析），控制台仍按 usePretty 走美化
  const logFile = process.env["LOG_FILE"];
  if (logFile) {
    try {
      mkdirSync(dirname(logFile), { recursive: true });
      const dest = pino.destination(logFile);
      if (usePretty) {
        const prettyStream = await createPrettyStream().catch(() => null);
        if (prettyStream) {
          return pino(pinoOptions, pino.multistream([{ stream: prettyStream }, dest]));
        }
      }
      return pino(pinoOptions, dest);
    } catch {
      // 落盘失败（磁盘只读等）降级为下方标准输出路径，日志不丢
    }
  }

  if (usePretty) {
    const prettyStream = await createPrettyStream().catch(() => null);
    if (prettyStream) return pino(pinoOptions, prettyStream);
  }
  // 显式传 process.stdout 走 Node 原生宽字符通道，避免 Windows 控制台乱码
  return pino(pinoOptions, process.stdout);
}

export const logger = await initLogger();
