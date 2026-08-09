import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRuntimeConfigs,
  updateRuntimeConfig,
  type RuntimeConfigUpdate,
} from "@/lib/api/runtime-config";

export const runtimeConfigOptions = {
  all: ["runtime-configs"] as const,
  list: () =>
    queryOptions({
      queryKey: runtimeConfigOptions.all,
      queryFn: ({ signal }) => listRuntimeConfigs(signal),
    }),
};

export function useRuntimeConfigs(options?: { enabled?: boolean }) {
  return useQuery({
    ...runtimeConfigOptions.list(),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateRuntimeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runtime, ...payload }: { runtime: string } & RuntimeConfigUpdate) =>
      updateRuntimeConfig(runtime, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: runtimeConfigOptions.all });
    },
  });
}
