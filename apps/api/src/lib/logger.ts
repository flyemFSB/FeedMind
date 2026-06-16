import pino from "pino";
import { apiEnv } from "../env.js";

const devTransport =
  apiEnv.APP_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname,service,env",
          },
        },
      }
    : {};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...devTransport,
  base: {
    service: apiEnv.APP_NAME,
    env: apiEnv.APP_ENV,
  },
  redact: {
    paths: ["api_key", "apiKey", "password", "cookie", "cookies", "authorization", "Authorization"],
    censor: "[REDACTED]",
  },
});
