import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/pages/settings/settings-page";
import type { TabId } from "@/pages/settings/settings-types";

type SettingsSearch = {
  tab?: TabId;
};

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
