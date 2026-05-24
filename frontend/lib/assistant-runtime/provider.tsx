"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import {
  getAgentCheckpointId,
  agentStream,
  getAgentThreadState,
} from "@/lib/api/agent";
import { createFeedMindThreadListAdapter } from "@/lib/api/chats";

export function FeedMindRuntimeProvider({ children }: { children: ReactNode }) {
  const loadThread = useCallback(async (externalId: string, config?: { signal?: AbortSignal }) => {
    const state = await getAgentThreadState(externalId, config?.signal);
    const values = state.values ?? {};

    return {
      messages: values.messages ?? [],
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
  const threadListAdapter = useMemo(() => createFeedMindThreadListAdapter(), []);

  const runtime = useLangGraphRuntime({
    stream: agentStream,
    load: loadThread,
    getCheckpointId,
    unstable_threadListAdapter: threadListAdapter,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
