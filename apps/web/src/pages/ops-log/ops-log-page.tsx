import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/app/shell/layout-wrapper";
import { OpsLogView } from "@/pages/ops-log/ops-log-view";

export function OpsLogPage() {
  const { t } = useTranslation();
  return (
    <LayoutWrapper title={t("opsLog.title")}>
      <div className="mx-auto max-w-[1080px] space-y-4 px-6 pt-6 pb-6 max-sm:px-4">
        <OpsLogView />
      </div>
    </LayoutWrapper>
  );
}
