import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/app/shell/layout-wrapper";
import { SettingsView } from "@/pages/settings/settings-view";
import type { TabId } from "@/pages/settings/settings-types";

export function SettingsPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/settings" });
  const navigate = useNavigate();
  const activeTab = search.tab ?? "models";

  const handleTabChange = (tab: TabId) => {
    void navigate({
      to: "/settings",
      search: { tab },
      replace: false,
    });
  };

  return (
    <LayoutWrapper title={t("settings.title")}>
      <SettingsView activeTab={activeTab} onTabChange={handleTabChange} />
    </LayoutWrapper>
  );
}
