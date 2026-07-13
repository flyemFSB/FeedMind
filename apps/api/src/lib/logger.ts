import pino from "pino";
import { isProduction } from "@feedmind/env";
import { apiEnv } from "../env.js";
import { APP_NAME } from "./constants.js";

const devTransport = isProduction()
  ? {}
  : {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname,service,env",
        },
      },
    };

export const logger = pino({
  level: apiEnv.LOG_LEVEL ?? (isProduction() ? "info" : "debug"),
  ...devTransport,
  base: {
    service: APP_NAME,
    env: apiEnv.APP_ENV,
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
