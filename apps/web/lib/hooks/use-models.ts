import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  getSelectedModel,
  setSelectedModel,
} from "@/lib/api/models";

export const modelKeys = {
  all: ["models"] as const,
  list: (type?: string) => [...modelKeys.all, "list", type] as const,
  selected: (type?: string) => [...modelKeys.all, "selected", type] as const,
};

export function useModels(type?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: modelKeys.list(type),
    queryFn: ({ signal }) => listModels(type, signal),
    enabled: options?.enabled,
  });
}

export function useSelectedModel(type?: string) {
  return useQuery({
    queryKey: modelKeys.selected(type),
    queryFn: ({ signal }) => getSelectedModel(type, signal),
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.all });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateModel>[1]) =>
      updateModel(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.all });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.all });
    },
  });
}

export function useSetSelectedModel(type?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setSelectedModel(id, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.selected(type) });
    },
  });
}
