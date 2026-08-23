import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { SettingsView } from "@/components/settings/settings-view";
import type { TabId } from "@/components/settings/settings-types";

export interface SettingsSearch {
  tab?: TabId;
}

const VALID_TABS: readonly TabId[] = ["models", "runtime", "tools", "skills", "system"];

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = search["tab"] as TabId | undefined;
    return {
      tab: tab && VALID_TABS.includes(tab) ? tab : "models",
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
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
