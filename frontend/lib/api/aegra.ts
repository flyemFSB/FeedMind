import { Client } from "@langchain/langgraph-sdk";
import {
  unstable_createLangGraphStream,
  type LangChainMessage,
  type LangGraphInterruptState,
  type LangGraphMessagesEvent,
  type LangGraphStreamCallback,
  type UIMessage,
} from "@assistant-ui/react-langgraph";
import { getSelectedLLMModel, setSelectedLLMModel } from "@/lib/api/llm-models";

function emitToast(message: string, type: "error" | "info" | "success" = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("feedmind:toast", { detail: { message, type } }),
  );
}

type Thread = {
  thread_id: string;
};

type ThreadState = {
  values?: {
    messages?: LangChainMessage[];
    ui?: UIMessage[];
  };
  checkpoint?: {
    checkpoint_id?: string | null;
  };
  tasks?: Array<{
    interrupts?: LangGraphInterruptState[];
  }>;
};

type MessageWithId = {
  id?: unknown;
};

const aegraApiUrl =
  process.env.NEXT_PUBLIC_AEGRA_API_URL ?? "http://localhost:2026";
const backendApiUrl =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000";

export const feedmindAegraAssistantId =
  process.env.NEXT_PUBLIC_AEGRA_ASSISTANT_ID ?? "feedmind";

export const aegraClient = new Client({
  apiUrl: aegraApiUrl,
});

const selectedModelStorageKey = "feedmind:selected-model";
const selectedModelChangeEvent = "feedmind:selected-model-change";

export function getSelectedFeedMindModel(): string {
  if (typeof window !== "undefined") {
    const selectedModel = window.localStorage.getItem(selectedModelStorageKey);
    if (selectedModel) return selectedModel;
  }

  return process.env.NEXT_PUBLIC_FEEDMIND_MODEL ?? "";
}

export async function loadSelectedFeedMindModel(
  signal?: AbortSignal,
): Promise<string> {
  const selectedModel = await getSelectedLLMModel(signal);
  if (!selectedModel) return getSelectedFeedMindModel();

  setSelectedFeedMindModel(selectedModel);
  return selectedModel;
}

export function setSelectedFeedMindModel(model: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(selectedModelStorageKey, model);
    window.dispatchEvent(
      new CustomEvent(selectedModelChangeEvent, { detail: model }),
    );
  }
}

export async function persistSelectedFeedMindModel(model: string): Promise<void> {
  const selectedModel = await setSelectedLLMModel(model);
  setSelectedFeedMindModel(selectedModel);
}

export function onSelectedFeedMindModelChange(
  listener: (model: string) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") {
      listener(event.detail);
    }
  };

  window.addEventListener(selectedModelChangeEvent, handleChange);
  return () =>
    window.removeEventListener(selectedModelChangeEvent, handleChange);
}

export async function createAegraThread(): Promise<Thread> {
  return aegraClient.threads.create() as Promise<Thread>;
}

export async function getAegraThreadState(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadState> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const state = await aegraClient.threads.getState(threadId);
  return state as unknown as ThreadState;
}

export async function getAegraThreadHistory(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadState[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const history = await aegraClient.threads.getHistory(threadId);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return history as unknown as ThreadState[];
}

export async function getAegraCheckpointId(
  threadId: string,
  parentMessages: readonly MessageWithId[],
  signal?: AbortSignal,
): Promise<string | null> {
  if (parentMessages.length === 0) return null;
  if (!parentMessages.every((message) => typeof message.id === "string")) {
    return null;
  }

  const history = await getAegraThreadHistory(threadId, signal);
  for (const state of history) {
    const stateMessages = state.values?.messages;
    if (!stateMessages || stateMessages.length !== parentMessages.length) {
      continue;
    }

    const hasStableIds = stateMessages.every(
      (message) => typeof message.id === "string",
    );
    if (!hasStableIds) continue;

    const isMatch = parentMessages.every(
      (message, index) => message.id === stateMessages[index]?.id,
    );
    if (isMatch) {
      return state.checkpoint?.checkpoint_id ?? null;
    }
  }

  return null;
}

const baseAegraStream = unstable_createLangGraphStream({
  client: aegraClient,
  assistantId: feedmindAegraAssistantId,
  streamMode: ["messages-tuple", "custom"],
});

type PersistableRole = "user" | "assistant" | "system" | "tool";

type PersistableMessage = {
  aegra_message_id: string;
  role: PersistableRole;
  content: string;
  status: "completed";
  model: string;
  metadata: Record<string, unknown>;
};

function getMessageRole(message: LangChainMessage): PersistableRole {
  if (message.type === "human") return "user";
  if (message.type === "ai") return "assistant";
  return message.type;
}

function readContentText(content: LangChainMessage["content"]): string {
  if (typeof content === "string") return content.trim();

  return content
    .flatMap((part) => {
      if (part.type === "text" || part.type === "text_delta") return part.text;
      if (part.type === "thinking") return part.thinking;
      if (part.type === "reasoning") return part.summary.map((item) => item.text);
      return [];
    })
    .join("")
    .trim();
}

function toPersistableMessages(
  messages: LangChainMessage[],
  checkpointId?: string | null,
): PersistableMessage[] {
  const model = getSelectedFeedMindModel();

  return messages.flatMap((message, index) => {
    const content = readContentText(message.content);
    if (!content) return [];

    return {
      aegra_message_id: message.id ?? `${index}:${getMessageRole(message)}`,
      role: getMessageRole(message),
      content,
      status: "completed",
      model: message.type === "ai" ? model : "",
      metadata: {
        ...(message.id ? { aegra_message_id: message.id } : {}),
        ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
        branch_index: index,
      },
    };
  });
}

async function saveChatSessionSnapshot(threadId: string): Promise<void> {
  const state = await getAegraThreadState(threadId);
  const messages = toPersistableMessages(
    state.values?.messages ?? [],
    state.checkpoint?.checkpoint_id,
  );

  // 会话快照只保存最终文本内容，不记录流式 token。
  await fetch(`${backendApiUrl}/api/chat-sessions/${encodeURIComponent(threadId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

async function* filterAegraMetadataEvents(
  stream: AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>,
): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
  for await (const event of stream) {
    if (event.event === "messages/metadata") continue;
    yield event;
  }
}

// Aegra 兼容 LangGraph SDK，assistant-ui 仍通过 react-langgraph 消费流。
export const aegraStream: LangGraphStreamCallback<LangChainMessage> = async (
  messages,
  config,
) => {
  let initializedThread:
    | Awaited<ReturnType<typeof config.initialize>>
    | undefined;
  const runConfig =
    config.runConfig != null && typeof config.runConfig === "object"
      ? config.runConfig
      : {};
  const configurable =
    "configurable" in runConfig &&
    runConfig.configurable != null &&
    typeof runConfig.configurable === "object"
      ? runConfig.configurable
      : {};
  const selectedModel = getSelectedFeedMindModel().trim();

  if (!selectedModel) {
    emitToast("请先配置模型后再发送消息", "error");
    return (async function* emptyStream() {})();
  }

  const stream = await baseAegraStream(messages, {
    ...config,
    initialize: async () => {
      initializedThread ??= await config.initialize();
      return initializedThread;
    },
    runConfig: {
      ...runConfig,
      configurable: {
        ...configurable,
        model: selectedModel,
      },
    },
  });

  async function* persistAfterComplete() {
    for await (const event of filterAegraMetadataEvents(stream)) {
      yield event;
    }

    if (!initializedThread?.externalId || config.abortSignal.aborted) return;

    try {
      await saveChatSessionSnapshot(initializedThread.externalId);
    } catch (error) {
      emitToast("保存会话快照失败，请重试", "error");
      console.warn("保存会话快照失败", error);
    }
  }

  return persistAfterComplete();
};
