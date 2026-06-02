export type TabId = "account" | "models" | "session" | "security" | "tools";

export interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}
