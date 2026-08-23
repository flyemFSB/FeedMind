import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";

export const Route = createFileRoute("/feeds")({
  component: FeedsLayout,
});

function FeedsLayout() {
  const { t } = useTranslation();
  return (
    <LayoutWrapper title={t("feeds.title")}>
      <Outlet />
    </LayoutWrapper>
  );
}
