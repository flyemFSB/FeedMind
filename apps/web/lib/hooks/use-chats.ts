import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatKeys, listChatSessions, deleteChatSessionApi } from "@/lib/api/chats";

export function useChatSessions() {
  return useQuery({
    queryKey: chatKeys.list(),
    queryFn: listChatSessions,
  });
}

export function useDeleteChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteChatSessionApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}
