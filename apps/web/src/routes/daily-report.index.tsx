import { createFileRoute } from "@tanstack/react-router";
import { DailyReportPage } from "@/pages/daily-report/daily-report-page";

export const Route = createFileRoute("/daily-report/")({
  component: DailyReportPage,
});
