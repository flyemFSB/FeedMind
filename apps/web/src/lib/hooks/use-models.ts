import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listModels,
  listModelCatalog,
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

/** models.dev 模型目录（选中 provider 时才请求；自定义 provider 由调用方传空串跳过） */
export function useModelCatalog(provider: string) {
  return useQuery({
    queryKey: [...modelOptions.all, "catalog", provider] as const,
    queryFn: ({ signal }) => listModelCatalog(provider, signal),
    enabled: Boolean(provider),
    // 目录一周才更新一次，前端不必频繁回源
    staleTime: 60 * 60 * 1000,
  });
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
