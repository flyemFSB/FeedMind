"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import {
  getAegraCheckpointId,
  aegraStream,
  getAegraThreadState,
} from "@/lib/api/aegra";
import {
  createFeedMindThreadListAdapter,
  getLastActiveFeedMindThreadId,
} from "@/lib/api/chat-sessions";

export function FeedMindRuntimeProvider({ children }: { children: ReactNode }) {
  const loadThread = useCallback(async (externalId: string, config?: { signal?: AbortSignal }) => {
    const state = await getAegraThreadState(externalId, config?.signal);
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
    ) => getAegraCheckpointId(externalId, parentMessages, config?.signal),
    [],
  );
  const threadListAdapter = useMemo(() => createFeedMindThreadListAdapter(), []);

  const runtime = useLangGraphRuntime({
    stream: aegraStream,
    load: loadThread,
    getCheckpointId,
    unstable_threadListAdapter: threadListAdapter,
  });

  useEffect(() => {
    const activeThreadId = getLastActiveFeedMindThreadId();
    if (!activeThreadId) return;

    runtime.threads.switchToThread(activeThreadId).catch(() => undefined);
  }, [runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
