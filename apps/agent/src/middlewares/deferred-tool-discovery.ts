import { createMiddleware } from "langchain";

type DeferredToolDiscoveryConfig = {
  /** 初始延迟的工具名列表。这些工具不会出现在模型上下文中，直到被 tool_search 发现。 */
  deferredTools: string[];
};

/** 仿照 deer-flow DeferredToolFilterMiddleware 实现的延迟工具发现中间件。
 *
 * wrapModelCall：从 request.tools 中剥离仍处于延迟状态的工具，使 LLM 看不见其 schema。
 * wrapToolCall：若 LLM 仍尝试调用未发现的工具，返回指导性错误信息。
 * beforeAgent：将延迟工具名注入系统提示词，让模型知晓可用工具的存在。
 *
 * 用法:
 * ```ts
 * const agent = createAgent({
 *   middleware: [deferredToolDiscoveryMiddleware({ deferredTools: ["web_fetch"] })],
 *   ...
 * });
 * ```
 */
export function deferredToolDiscoveryMiddleware(config: DeferredToolDiscoveryConfig) {
  const deferred = new Set(config.deferredTools);

  return createMiddleware({
    name: "DeferredToolDiscovery",

    beforeAgent: async (state) => {
      if (deferred.size === 0) return state;
      return {
        ...state,
        _deferredTools: config.deferredTools,
        _promotedTools: (state as Record<string, unknown>)._promotedTools ?? [],
      };
    },

    wrapModelCall: async (request, handler) => {
      if (deferred.size === 0) return handler(request);

      const promotedSet = new Set(
        ((request.state as Record<string, unknown>)._promotedTools as string[]) ?? [],
      );
      const activeTools = request.tools.filter((tool) => {
        const toolName = (tool as { name?: string }).name;
        return !toolName || !deferred.has(toolName) || promotedSet.has(toolName);
      });

      return handler({ ...request, tools: activeTools });
    },

    wrapToolCall: async (request, handler) => {
      const toolName = request.toolCall.name;
      if (!toolName || !deferred.has(toolName)) return handler(request);

      const promotedSet = new Set(
        ((request.state as Record<string, unknown>)._promotedTools as string[]) ?? [],
      );
      if (!promotedSet.has(toolName)) {
        const { ToolMessage } = await import("@langchain/core/messages");
        return new ToolMessage({
          content:
            `Tool "${toolName}" is not yet discovered. ` +
            `Use the "tool_search" tool with a keyword query to discover and activate it. ` +
            `Available deferred tools: ${config.deferredTools.join(", ")}.`,
          tool_call_id: request.toolCall.id ?? "",
        });
      }

      return handler(request);
    },
  });
}
