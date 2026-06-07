import { createFileRoute } from "@tanstack/react-router";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Thread } from "@/components/assistant-ui/thread";
import { PreviewPanel } from "@/components/chat/preview-panel";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <LayoutWrapper title="FeedMind Agent" showModelSelector>
      <div className="h-full">
        <Thread />
      </div>
      <PreviewPanel />
    </LayoutWrapper>
  );
}
