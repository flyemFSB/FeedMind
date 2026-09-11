/**
 * /wiki 的 URL 搜索参数契约。
 * 外壳侧边栏（构造链接）与 wiki 页面（读取参数）都依赖视图枚举，故置于共享层——
 * 放在 routes/ 里会让外壳反向依赖路由模块。
 */

/** wiki 子视图：pages 列表 / graph 图谱 / sources 来源 */
export type WikiView = "pages" | "graph" | "sources";

export const VALID_VIEWS: WikiView[] = ["pages", "graph", "sources"];
