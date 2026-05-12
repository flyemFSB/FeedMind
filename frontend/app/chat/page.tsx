"use client";

import { useState } from "react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Thread } from "@/components/assistant-ui/thread";
import { PreviewPanel } from "@/components/chat/preview-panel";

export default function ChatPage() {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <LayoutWrapper
      title="FeedMind Agent"
    >
      <div
        className={`h-full transition-transform duration-200 ease-out ${
          previewOpen
            ? "-translate-x-[min(260px,21vw)] max-lg:-translate-x-[min(160px,22vw)] max-sm:translate-x-0"
            : "translate-x-0"
        }`}
      >
        <Thread />
      </div>
      <PreviewPanel onOpenChange={setPreviewOpen} />
    </LayoutWrapper>
  );
}
