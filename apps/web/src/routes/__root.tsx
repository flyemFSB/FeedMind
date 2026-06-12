import { useTranslation } from "react-i18next";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ChatProvider } from "@/lib/chat/chat-context";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query-client";
import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider } from "@/components/theme-provider";
import "@/app/globals.css";
import { TanStackRouterDevtools } from "@/src/devtools";
import { TanStackQueryDevtools } from "@/src/devtools";

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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "FeedMind - AI Research Agent" },
      {
        name: "description",
        content: "Task-driven trend research Agent system",
      },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument() {
  // SSR: per-request QueryClient  |  CSR: singleton via useState
  const [queryClient] = useState(createQueryClient);
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full flex flex-col bg-editorial-canvas">
        <ErrorBoundary>
          <ThemeProvider>
            <I18nProvider>
              <TooltipProvider>
                <QueryClientProvider client={queryClient}>
                  <ChatProvider>
                    <Outlet />
                  </ChatProvider>
                  <TanStackQueryDevtools />
                </QueryClientProvider>
              </TooltipProvider>
            </I18nProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <Toaster richColors closeButton position="top-center" />
        <Scripts />
        <TanStackRouterDevtools />
      </body>
    </html>
  );
}
