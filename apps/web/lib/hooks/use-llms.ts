import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listLLMModels,
  createLLMModel,
  updateLLMModel,
  deleteLLMModel,
  getSelectedLLMModel,
  setSelectedLLMModel,
} from "@/lib/api/llms";
import type { LLMModel } from "@/lib/types";

export const llmKeys = {
  all: ["llms"] as const,
  list: () => [...llmKeys.all, "list"] as const,
  selected: () => [...llmKeys.all, "selected"] as const,
};

export function useLLMModels(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: llmKeys.list(),
    queryFn: ({ signal }) => listLLMModels(signal),
    enabled: options?.enabled,
  });
}

export function useSelectedLLMModel() {
  return useQuery({
    queryKey: llmKeys.selected(),
    queryFn: ({ signal }) => getSelectedLLMModel(signal),
  });
}

export function useCreateLLMModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLLMModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmKeys.list() });
    },
  });
}

export function useUpdateLLMModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateLLMModel>[1]) =>
      updateLLMModel(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmKeys.list() });
    },
  });
}

export function useDeleteLLMModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLLMModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmKeys.list() });
    },
  });
}

export function useSetSelectedLLMModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setSelectedLLMModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmKeys.selected() });
    },
  });
}
