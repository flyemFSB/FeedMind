import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listChatSessions, deleteChatSessionApi } from "@/lib/api/chats";

export const chatOptions = {
  all: ["chats"] as const,
  list: () =>
    queryOptions({
      queryKey: [...chatOptions.all, "list"] as const,
      queryFn: listChatSessions,
    }),
};

export function useChatSessions() {
  return useQuery(chatOptions.list());
}

export function useDeleteChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteChatSessionApi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatOptions.list().queryKey });
    },
  });
}
