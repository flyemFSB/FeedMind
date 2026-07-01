import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedEnv } from "./shared.js";

/** API 服务端环境变量（继承共享变量） */
export const apiEnv = createEnv({
  extends: [sharedEnv],
  server: {
    /** API 服务器监听地址（Docker 部署设为 "0.0.0.0"） */
    API_HOST: z.string().default("127.0.0.1"),
    /** API 服务器监听端口 */
    API_PORT: z.coerce.number().int().positive().default(18790),
    /** 是否禁用 Wiki 导入 worker（设为 "1" 禁用） */
    DISABLE_INGEST_WORKER: z.string().optional(),
    /** Wiki 文件存储目录（相对项目根目录的路径） */
    WIKI_DIR: z.string().optional(),
    /** 爬虫回调 API 地址（反向代理场景覆盖） */
    API_BASE_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.npm_lifecycle_event === "lint" ||
    process.env.npm_lifecycle_event === "typecheck",
});
