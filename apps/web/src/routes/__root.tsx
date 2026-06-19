import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell/app-shell";

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">{t("error.notFound")}</p>
      <a href="/" className="text-sm text-primary hover:underline">
        {t("error.backToHome")}
      </a>
    </div>
  );
}

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
