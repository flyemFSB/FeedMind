import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTools, updateAllToolConfigs } from "@/lib/api/tools";

export const toolOptions = {
  all: ["tools"] as const,
  list: () =>
    queryOptions({
      queryKey: [...toolOptions.all, "list"] as const,
      queryFn: ({ signal }) => listTools(signal),
    }),
};

export function useTools(options?: { enabled?: boolean }) {
  return useQuery({
    ...toolOptions.list(),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateAllToolConfigs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configs: Parameters<typeof updateAllToolConfigs>[0]) =>
      updateAllToolConfigs(configs),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolOptions.list().queryKey });
    },
  });
}
