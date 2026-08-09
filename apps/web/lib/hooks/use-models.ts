import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listModels,
  createModel,
  updateModel,
  deleteModel,
  getSelectedModel,
  setSelectedModel,
} from "@/lib/api/models";

export const modelOptions = {
  all: ["models"] as const,
  list: (type?: string) =>
    queryOptions({
      queryKey: [...modelOptions.all, "list", type] as const,
      queryFn: ({ signal }) => listModels(type, signal),
    }),
  selected: (type?: string) =>
    queryOptions({
      queryKey: [...modelOptions.all, "selected", type] as const,
      queryFn: ({ signal }) => getSelectedModel(type, signal),
    }),
};

export function useModels(type?: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...modelOptions.list(type),
    enabled: options?.enabled ?? true,
  });
}

export function useSelectedModel(type?: string) {
  return useQuery(modelOptions.selected(type));
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelOptions.all });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateModel>[1]) =>
      updateModel(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelOptions.all });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelOptions.all });
    },
  });
}

export function useSetSelectedModel(type?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setSelectedModel(id, type),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelOptions.selected(type).queryKey });
    },
  });
}
