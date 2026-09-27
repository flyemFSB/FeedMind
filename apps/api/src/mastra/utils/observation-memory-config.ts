import { trimLargeToolResults } from "./observation-hooks.js";

/** 构建会话级观察记忆配置与后台异步缓冲策略 */
export function buildObservationalMemoryConfig<M>({
  hasEmbedder,
  model,
}: {
  hasEmbedder: boolean;
  model: M;
}) {
  return {
    model,
    scope: "thread" as const,
    // 切换 Provider 前激活缓冲观察，避免向无缓存端点发送超大上下文
    activateOnProviderChange: true,
    // 会话闲置超时后激活压缩观察，降低长上下文占用
    activateAfterIdle: "auto" as const,
    // 注入时间标记以便观察记录包含时间上下文
    temporalMarkers: true,
    observation: {
      // 会话空闲时在后台预计算观察，沉淀短会话记忆
      bufferOnIdle: true,
      // 根据模型能力自动判断是否分析附件
      observeAttachments: "auto" as const,
    },
    // 具备嵌入模型时启用向量检索，缺省时降级为纯分页
    retrieval: hasEmbedder ? ({ vector: true } as const) : (true as const),
    // 截断超长工具输出，降低观察模型处理开销
    hooks: { beforeObservation: trimLargeToolResults() },
  };
}
