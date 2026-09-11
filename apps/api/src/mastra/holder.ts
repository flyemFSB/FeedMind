import type { Mastra } from "@mastra/core";

// 进程内持有 Mastra 实例：server-core 启动时注入，供服务层（如 upsert 后同步调度）访问。
// 存在的理由：modules → mastra 需要实例，而 mastra 的构造又依赖 modules（wiki 工具、模型解析），
// 直接 import 会成环。放在 mastra/ 而非 lib/ —— 它是 Agent 子系统的实例，纯技术设施层不该认识它。
let mastra: Mastra | undefined;

export function setMastra(instance: Mastra): void {
  mastra = instance;
}

export function getMastra(): Mastra | undefined {
  return mastra;
}
