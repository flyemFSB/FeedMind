import type { Mastra } from "@mastra/core";

// 进程内持有 Mastra 实例：server-core 启动时注入，供服务层（如 upsert 后同步调度）访问
let mastra: Mastra | undefined;

export function setMastra(instance: Mastra): void {
  mastra = instance;
}

export function getMastra(): Mastra | undefined {
  return mastra;
}
