import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listRuntimeConfigs, updateRuntimeConfig, type RuntimeConfigUpdate } from "@/lib/api/runtime-config";

export const runtimeConfigKeys = {
  all: ["runtime-configs"] as const,
};

export function useRuntimeConfigs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: runtimeConfigKeys.all,
    queryFn: ({ signal }) => listRuntimeConfigs(signal),
    enabled: options?.enabled,
  });
}

export function useUpdateRuntimeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scenario, ...payload }: { scenario: string } & RuntimeConfigUpdate) =>
      updateRuntimeConfig(scenario, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runtimeConfigKeys.all });
    },
  });
}
