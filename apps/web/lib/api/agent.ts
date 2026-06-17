import { setSelectedLLMModel } from "@/lib/api/llms";

const selectedModelStorageKey = "feedmind:selected-model";
const selectedModelIdStorageKey = "feedmind:selected-model-id";
const selectedModelChangeEvent = "feedmind:selected-model-change";

export function getSelectedFeedMindModel(): string {
  if (typeof window !== "undefined") {
    const selectedModel = window.localStorage.getItem(selectedModelStorageKey);
    if (selectedModel) return selectedModel;
  }
  return "";
}

export function setSelectedFeedMindModel(model: string): void {
  if (typeof window !== "undefined") {
    if (model) {
      window.localStorage.setItem(selectedModelStorageKey, model);
    } else {
      window.localStorage.removeItem(selectedModelStorageKey);
    }
    window.dispatchEvent(new CustomEvent(selectedModelChangeEvent, { detail: model }));
  }
}

/** 获取选中模型的 API 模型 ID（如 "deepseek-v4-flash"） */
export function getSelectedFeedMindModelId(): string {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(selectedModelIdStorageKey) ?? "";
  }
  return "";
}

/** 存储选中模型的 API 模型 ID */
export function setSelectedFeedMindModelId(modelId: string): void {
  if (typeof window !== "undefined") {
    if (modelId) {
      window.localStorage.setItem(selectedModelIdStorageKey, modelId);
    } else {
      window.localStorage.removeItem(selectedModelIdStorageKey);
    }
  }
}

/** 后端持久化选中模型，先同步前端再回滚到旧值 */
export async function persistSelectedFeedMindModel(model: string): Promise<void> {
  const previousModel = getSelectedFeedMindModel();
  setSelectedFeedMindModel(model);
  try {
    const selectedModel = await setSelectedLLMModel(model);
    setSelectedFeedMindModel(selectedModel);
  } catch (error) {
    setSelectedFeedMindModel(previousModel);
    throw error;
  }
}

export function onSelectedFeedMindModelChange(listener: (model: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") {
      listener(event.detail);
    }
  };

  window.addEventListener(selectedModelChangeEvent, handleChange);
  return () => window.removeEventListener(selectedModelChangeEvent, handleChange);
}
