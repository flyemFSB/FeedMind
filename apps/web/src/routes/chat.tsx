import { createFileRoute } from "@tanstack/react-router";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { Thread } from "@/components/chat/thread";
import { PreviewPanel } from "@/components/chat/preview-panel";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  const { t } = useTranslation();
  return (
    <LayoutWrapper title={t("chat.title")} showModelSelector>
      <div className="h-full">
        <Thread />
      </div>
      <PreviewPanel />
    </LayoutWrapper>
  );
}
