import { toast } from "sonner";
import { Client } from "@langchain/langgraph-sdk";
import {
  unstable_createLangGraphStream,
  type LangChainMessage,
  type LangGraphInterruptState,
  type LangGraphMessagesEvent,
  type LangGraphStreamCallback,
  type UIMessage,
} from "@assistant-ui/react-langgraph";
import { getSelectedLLMModel, setSelectedLLMModel } from "@/lib/api/llms";
import { apiFetch, backendApiPath } from "./client";

// 通过 CustomEvent 广播 Agent 运行状态，供 Sidebar 展示动画指示器
const agentRunningEvent = "feedmind:agent-running";

export function emitAgentRunning(running: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(agentRunningEvent, { detail: running }));
}

export function onAgentRunningChange(
  listener: (running: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    if (event instanceof CustomEvent) {
      listener(event.detail as boolean);
    }
  };
  window.addEventListener(agentRunningEvent, handler);
  return () => window.removeEventListener(agentRunningEvent, handler);
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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object";
}

function toThinkingPart(text: string): UnknownRecord {
  return { type: "thinking", thinking: text };
}

function readReasoningText(part: unknown): string {
  if (!isRecord(part)) return "";

  if (typeof part.reasoning === "string") return part.reasoning.trim();
  if (typeof part.thinking === "string") return part.thinking.trim();
  if (typeof part.text === "string") return part.text.trim();
  if (!Array.isArray(part.summary)) return "";

  return part.summary
    .flatMap((item) => (isRecord(item) && typeof item.text === "string" ? item.text : []))
    .join("\n\n")
    .trim();
}

function normalizeReasoningPart(part: unknown): unknown {
  if (!isRecord(part) || part.type !== "reasoning") return part;

  const text = readReasoningText(part);
  return text ? { ...part, ...toThinkingPart(text) } : part;
}

function normalizeReasoningContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  return content.map(normalizeReasoningPart);
}

function normalizeReasoningMessage<TMessage>(message: TMessage): TMessage {
  if (!isRecord(message)) return message;

  const normalized: UnknownRecord = { ...message };
  if ("content" in normalized) {
    normalized.content = normalizeReasoningContent(normalized.content);
  }

  if (isRecord(normalized.additional_kwargs)) {
    const additionalKwargs = { ...normalized.additional_kwargs };
    if (
      !("reasoning" in additionalKwargs) &&
      typeof additionalKwargs.reasoning_content === "string" &&
      additionalKwargs.reasoning_content.trim()
    ) {
      additionalKwargs.reasoning = toThinkingPart(additionalKwargs.reasoning_content.trim());
    }
    if (typeof additionalKwargs.reasoning === "string" && additionalKwargs.reasoning.trim()) {
      additionalKwargs.reasoning = toThinkingPart(additionalKwargs.reasoning.trim());
    }
    if ("reasoning" in additionalKwargs) {
      additionalKwargs.reasoning = normalizeReasoningPart(additionalKwargs.reasoning);
    }
    normalized.additional_kwargs = additionalKwargs;
  }

  return normalized as TMessage;
}

function normalizeReasoningMessages<TMessage>(messages: TMessage[]): TMessage[] {
  return messages.map(normalizeReasoningMessage);
}

function normalizeReasoningEventData<TMessage>(data: unknown): unknown {
  if (Array.isArray(data)) {
    if (data.length === 2 && isRecord(data[1])) {
      return [normalizeReasoningMessage(data[0]), data[1]];
    }
    return normalizeReasoningMessages(data as TMessage[]);
  }

  if (!isRecord(data)) return data;

  const normalized: UnknownRecord = { ...data };
  if (Array.isArray(normalized.messages)) {
    normalized.messages = normalizeReasoningMessages(normalized.messages as TMessage[]);
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (key === "messages" || !isRecord(value) || !Array.isArray(value.messages)) {
      continue;
    }

    normalized[key] = {
      ...value,
      messages: normalizeReasoningMessages(value.messages as TMessage[]),
    };
  }

  return normalized;
}

function normalizeReasoningEvent<TMessage>(
  event: LangGraphMessagesEvent<TMessage>,
): LangGraphMessagesEvent<TMessage> {
  return {
    ...event,
    data: normalizeReasoningEventData<TMessage>(event.data),
  };
}

function normalizeThreadStateReasoning(state: ThreadState): ThreadState {
  if (!state.values?.messages) return state;

  return {
    ...state,
    values: {
      ...state.values,
      messages: normalizeReasoningMessages(state.values.messages),
    },
  };
}

const agentApiUrl =
  typeof window === "undefined"
    ? "http://localhost:3000/api/agent"
    : `${window.location.origin}/api/agent`;

export const feedmindAgentAssistantId =
  import.meta.env.VITE_FEEDMIND_ASSISTANT_ID ?? "feedmind";

export const agentClient = new Client({
  apiUrl: agentApiUrl,
});

const selectedModelStorageKey = "feedmind:selected-model";
const selectedModelChangeEvent = "feedmind:selected-model-change";

export function getSelectedFeedMindModel(): string {
  if (typeof window !== "undefined") {
    const selectedModel = window.localStorage.getItem(selectedModelStorageKey);
    if (selectedModel) return selectedModel;
  }

  return import.meta.env.VITE_FEEDMIND_MODEL ?? "";
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
    if (model) {
      window.localStorage.setItem(selectedModelStorageKey, model);
    } else {
      window.localStorage.removeItem(selectedModelStorageKey);
    }
    window.dispatchEvent(
      new CustomEvent(selectedModelChangeEvent, { detail: model }),
    );
  }
}

// 后端持久化选中模型，先同步前端再回滚到旧值
export async function persistSelectedFeedMindModel(model: string): Promise<void> {
  const previousModel = getSelectedFeedMindModel();
  // 先同步前端选择，避免用户选择后立即发送时 runConfig.model 仍为空
  setSelectedFeedMindModel(model);
  try {
    const selectedModel = await setSelectedLLMModel(model);
    setSelectedFeedMindModel(selectedModel);
  } catch (error) {
    // 后端写入失败时回滚前端状态
    setSelectedFeedMindModel(previousModel);
    throw error;
  }
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

export async function createAgentThread(): Promise<Thread> {
  return agentClient.threads.create() as Promise<Thread>;
}

export async function getAgentThreadState(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadState> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const state = await agentClient.threads.getState(threadId);
  return normalizeThreadStateReasoning(state as unknown as ThreadState);
}

export async function getAgentThreadHistory(
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadState[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const history = await agentClient.threads.getHistory(threadId, { limit: 100 });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return history as unknown as ThreadState[];
}

// 遍历历史 state，找到与当前消息列表匹配的 checkpoint_id，用于分支编辑/重新生成
export async function getAgentCheckpointId(
  threadId: string,
  parentMessages: readonly MessageWithId[],
  signal?: AbortSignal,
): Promise<string | null> {
  const hasParentMessages = parentMessages.length > 0;
  if (hasParentMessages && !hasStableMessageIds(parentMessages)) {
    toast.error("当前消息缺少稳定 ID，无法安全编辑或重新生成");
    console.warn("无法定位 checkpoint：parentMessages 缺少稳定 ID", parentMessages);
    return null;
  }

  let history: ThreadState[];
  try {
    history = await getAgentThreadHistory(threadId, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    toast.error("读取历史 checkpoint 失败，请重试");
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

  toast.error("无法定位对应的历史 checkpoint，编辑分支未启动");
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

const baseAgentStream = unstable_createLangGraphStream({
  client: agentClient,
  assistantId: feedmindAgentAssistantId,
  streamMode: ["messages-tuple", "updates", "custom"],
});

type PersistableRole = "user" | "assistant" | "system" | "tool";

type PersistableMessage = {
  agent_message_id: string;
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
      if (part.type === "reasoning") return readReasoningText(part);
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
    ...(message.id ? { agent_message_id: message.id } : {}),
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
    agent_message_id: message.id ?? `${index}:${role}`,
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
  const state = await getAgentThreadState(threadId);
  const messages = toPersistableMessages(
    state.values?.messages ?? [],
    state.checkpoint?.checkpoint_id,
  );

  // 会话快照只保存最终文本内容，不记录流式 token。
  await apiFetch(backendApiPath(`/chats/${encodeURIComponent(threadId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

async function* filterAgentMetadataEvents(
  stream: AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>>,
): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
  for await (const event of stream) {
    if (event.event === "messages/metadata") continue;
    yield normalizeReasoningEvent(event);
  }
}

// Agent 兼容 LangGraph SDK，assistant-ui 仍通过 react-langgraph 消费流。
export const agentStream: LangGraphStreamCallback<LangChainMessage> = async (
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
    toast.error("请先配置模型后再发送消息");
    return (async function* emptyStream() {})();
  }

  const stream = await baseAgentStream(messages, {
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
    for await (const event of filterAgentMetadataEvents(stream)) {
      yield event;
    }

    if (!initializedThread?.externalId || config.abortSignal.aborted) return;

    try {
      await saveChatSessionSnapshot(initializedThread.externalId);
    } catch (error) {
      toast.error("保存会话快照失败，请重试");
      console.warn("保存会话快照失败", error);
    }
  }

  return persistAfterComplete();
};
