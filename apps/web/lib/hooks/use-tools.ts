import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTools, updateAllToolConfigs } from "@/lib/api/tools";

export const toolKeys = {
  all: ["tools"] as const,
  list: () => [...toolKeys.all, "list"] as const,
};

export function useTools(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: toolKeys.list(),
    queryFn: ({ signal }) => listTools(signal),
    enabled: options?.enabled,
  });
}

export function useUpdateAllToolConfigs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configs: Parameters<typeof updateAllToolConfigs>[0]) =>
      updateAllToolConfigs(configs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toolKeys.list() });
    },
  });
}
