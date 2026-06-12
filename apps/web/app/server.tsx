/**
 * TanStack Start SSR 入口
 * 负责 SSR 渲染和 API 代理路由处理
 */
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { getRouter } from "../src/router.js";

export default createStartHandler({
  createRouter: getRouter,
})(defaultStreamHandler);
