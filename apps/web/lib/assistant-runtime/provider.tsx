"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLangGraphRuntime, type LangChainMessage } from "@assistant-ui/react-langgraph";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAgentCheckpointId,
  agentStream,
  getAgentThreadState,
} from "@/lib/api/agent";
import { createFeedMindThreadListAdapter } from "@/lib/api/chats";

const ROLE_TO_TYPE: Record<string, string> = {
  user: "human",
  assistant: "ai",
  system: "system",
  tool: "tool",
};

/** 将 server 端返回的 role 格式消息归一化为 assistant-ui 期望的 type 格式。
 *
 * langgraph-server 返回的 messages 使用 OpenAI 命名规范（role: "user"/"assistant"），
 * 而 assistant-ui/convertLangChainMessages 的 switch 依赖 LangChain 命名规范（type: "human"/"ai"）。
 * 该函数在 loadThread 入口处做兼容转换。
 */
function normalizeMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const msg = message as Record<string, unknown>;
  if (msg.type) return message;
  const role = msg.role;
  if (typeof role === "string" && role in ROLE_TO_TYPE) {
    const { role: _, ...rest } = msg;
    return { ...rest, type: ROLE_TO_TYPE[role] };
  }
  return message;
}

export function FeedMindRuntimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const loadThread = useCallback(async (externalId: string, config?: { signal?: AbortSignal }) => {
    const state = await getAgentThreadState(externalId, config?.signal);
    const values = state.values ?? {};

    const messages: LangChainMessage[] = (values.messages ?? []).map(normalizeMessage) as any;
    return {
      messages,
      interrupts: state.tasks?.[0]?.interrupts,
      uiMessages: values.ui ?? [],
    };
  }, []);
  const getCheckpointId = useCallback(
    async (
      externalId: string,
      parentMessages: readonly { id?: unknown }[],
      config?: { signal?: AbortSignal },
    ) => getAgentCheckpointId(externalId, parentMessages, config?.signal),
    [],
  );
  const threadListAdapter = useMemo(
    () => createFeedMindThreadListAdapter(queryClient),
    [queryClient],
  );

  const runtime = useLangGraphRuntime({
    stream: agentStream,
    load: loadThread,
    getCheckpointId,
    unstable_threadListAdapter: threadListAdapter,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
