"use client";

import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Thread } from "@/components/assistant-ui/thread";
import { PreviewPanel } from "@/components/chat/preview-panel";

export default function ChatPage() {
  return (
    <LayoutWrapper
      title="FeedMind Agent"
      showPreview={true}
      previewPanel={<PreviewPanel />}
    >
      <Thread />
    </LayoutWrapper>
  );
}
