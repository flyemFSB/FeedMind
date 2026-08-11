"use client";

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";

export const Route = createFileRoute("/daily-report")({
  component: DailyReportLayout,
});

function DailyReportLayout() {
  const { t } = useTranslation();
  return (
    <LayoutWrapper title={t("dailyReport.title")}>
      <Outlet />
    </LayoutWrapper>
  );
}
