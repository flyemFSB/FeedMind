import pkg from "../../package.json" with { type: "json" };

/** 应用名称（日志、OpenAPI 文档、根路由响应） */
export const APP_NAME = "FeedMind API";

/** 应用版本号（从 package.json 自动读取） */
export const APP_VERSION = pkg.version;

/** 全站默认时区（Agent prompt 等服务端场景） */
export const FEEDMIND_TIMEZONE = "Asia/Shanghai";
