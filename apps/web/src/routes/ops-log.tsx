import { createFileRoute } from "@tanstack/react-router";
import { OpsLogPage } from "@/pages/ops-log/ops-log-page";

export const Route = createFileRoute("/ops-log")({
  component: OpsLogPage,
});
