import { apiEnv } from "../env.js";

/** 本机回调地址：动态读取当前 API 端口，防止端口重配后指向旧端口 */
export function resolveApiBaseUrl(): string {
  return apiEnv.API_BASE_URL ?? `http://127.0.0.1:${process.env["API_PORT"] ?? apiEnv.API_PORT}`;
}
