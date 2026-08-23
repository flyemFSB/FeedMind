import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

export interface SubagentChildTool {
  toolName: string;
  toolCallId?: string | undefined;
  args?: unknown;
  result?: unknown;
  isError?: boolean | undefined;
}

export interface SubagentTaskData {
  taskId?: string | undefined;
  type: "researcher" | "extractor" | "summarizer" | "browser" | string;
  prompt: string;
  context?: string | undefined;
  result?: string | undefined;
  duration?: number | undefined;
  childTools?: SubagentChildTool[] | undefined;
  usage?:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
  status?: ("running" | "completed" | "error") | undefined;
  errorText?: string | undefined;
}

interface SubagentInspectorContextValue {
  isOpen: boolean;
  activeTask: SubagentTaskData | null;
  openInspector: (task: SubagentTaskData) => void;
  closeInspector: () => void;
}

const SubagentInspectorContext = createContext<SubagentInspectorContextValue | null>(null);

export function SubagentInspectorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<SubagentTaskData | null>(null);

  const openInspector = useCallback((task: SubagentTaskData) => {
    setActiveTask(task);
    setIsOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      activeTask,
      openInspector,
      closeInspector,
    }),
    [isOpen, activeTask, openInspector, closeInspector],
  );

  return (
    <SubagentInspectorContext.Provider value={value}>{children}</SubagentInspectorContext.Provider>
  );
}

export function useSubagentInspector() {
  const ctx = useContext(SubagentInspectorContext);
  if (!ctx) {
    throw new Error("useSubagentInspector must be used within SubagentInspectorProvider");
  }
  return ctx;
}
