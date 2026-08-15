"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { OperationLog } from "@/components/ops-log/operation-log";

export const Route = createFileRoute("/ops-log")({
  component: OpsLogPage,
});

function OpsLogPage() {
  const { t } = useTranslation();
  return (
    <LayoutWrapper title={t("opsLog.title")}>
      <div className="mx-auto max-w-[1080px] space-y-4 px-6 pb-6 max-sm:px-4">
        <OperationLog />
      </div>
    </LayoutWrapper>
  );
}
