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
  const hasParentMessages = parentMessages.length > 0;
  if (hasParentMessages && !hasStableMessageIds(parentMessages)) {
    emitToast("当前消息缺少稳定 ID，无法安全编辑或重新生成", "error");
    console.warn("无法定位 checkpoint：parentMessages 缺少稳定 ID", parentMessages);
    return null;
  }

  let history: ThreadState[];
  try {
    history = await getAegraThreadHistory(threadId, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    emitToast("读取历史 checkpoint 失败，请重试", "error");
    console.warn("读取历史 checkpoint 失败", error);
    return null;
  }

  for (const state of history) {
    const stateMessages = state.values?.messages ?? [];
    if (stateMessages.length !== parentMessages.length) {
      continue;
    }

    if (
      (!hasParentMessages || hasStableMessageIds(stateMessages)) &&
      parentMessages.every((message, index) => message.id === stateMessages[index]?.id)
    ) {
      return state.checkpoint?.checkpoint_id ?? null;
    }
  }

  emitToast("无法定位对应的历史 checkpoint，编辑分支未启动", "error");
  console.warn("无法定位 checkpoint", {
    threadId,
    parentMessageIds: parentMessages.map((message) => message.id),
    historyLength: history.length,
  });
  return null;
}

function hasStableMessageIds(messages: readonly MessageWithId[]): boolean {
  return messages.every((message) => typeof message.id === "string");
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
  status: "completed" | "failed";
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

function readMessageContent(message: LangChainMessage): string {
  const content = readContentText(message.content);
  if (content) return content;

  if (message.type === "ai" && message.tool_calls?.length) {
    const toolNames = message.tool_calls
      .map((toolCall) => toolCall.name)
      .filter(Boolean)
      .join(", ");
    return toolNames ? `工具调用：${toolNames}` : "工具调用";
  }

  if (message.type === "tool") {
    return `工具结果：${message.name}`;
  }

  return "";
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function toPersistableMessage(
  message: LangChainMessage,
  checkpointId: string | null | undefined,
  index: number,
  model: string,
): PersistableMessage | null {
  const content = readMessageContent(message);
  if (!content) return null;

  const role = getMessageRole(message);
  const metadata: Record<string, unknown> = {
    ...(message.id ? { aegra_message_id: message.id } : {}),
    ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
    branch_index: index,
  };

  if (message.type === "ai" && message.tool_calls?.length) {
    metadata.tool_calls = message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args,
      index: toolCall.index,
    }));
  }

  if (message.type === "tool") {
    const parsedResult = parseJsonContent(message.content);
    metadata.tool_call_id = message.tool_call_id;
    metadata.tool_name = message.name;
    metadata.tool_status = message.status;
    if (parsedResult !== undefined) metadata.tool_result = parsedResult;
    if (message.artifact !== undefined) metadata.tool_artifact = message.artifact;
  }

  return {
    aegra_message_id: message.id ?? `${index}:${role}`,
    role,
    content,
    status:
      message.type === "tool" && message.status === "error"
        ? "failed"
        : "completed",
    model: message.type === "ai" ? model : "",
    metadata,
  };
}

function toPersistableMessages(
  messages: LangChainMessage[],
  checkpointId?: string | null,
): PersistableMessage[] {
  const model = getSelectedFeedMindModel();

  return messages.flatMap((message, index) => {
    const persistable = toPersistableMessage(message, checkpointId, index, model);
    return persistable ? [persistable] : [];
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
