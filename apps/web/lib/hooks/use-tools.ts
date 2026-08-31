import { queryOptions, useQuery } from "@tanstack/react-query";
import { listTools } from "@/lib/api/tools";

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
