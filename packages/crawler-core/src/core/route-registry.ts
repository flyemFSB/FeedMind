/**
 * 站点适配器注册表：将站点路由名（如 "tieba/forum"）映射到处理函数。
 * 与 HTTP 路由无关——这里的 name 是爬虫站点路径标识。
 *
 * 各站点文件在 import 时通过 registerRoute() 自注册。
 * API 层通过此注册表分派任务到对应处理器。
 */

import type { RouteHandler } from "./types.js";

const registry = new Map<string, RouteHandler>();

/** 注册路由处理器，各路由文件在模块加载时调用。 */
export function registerRoute(name: string, handler: RouteHandler): void {
  if (registry.has(name)) {
    throw new Error(`路由 "${name}" 已注册`);
  }
  registry.set(name, handler);
}

/** 按名称获取路由处理器，未注册返回 undefined。 */
export function getRouteHandler(name: string): RouteHandler | undefined {
  return registry.get(name);
}
