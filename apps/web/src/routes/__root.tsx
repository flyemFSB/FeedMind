import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { FeedMindRuntimeProvider } from "@/lib/assistant-runtime/provider";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query-client";
import "@/app/globals.css";
import { TanStackRouterDevtools } from "@/src/devtools";
import { TanStackQueryDevtools } from "@/src/devtools";

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
});

function RootDocument() {
  // SSR: per-request QueryClient  |  CSR: singleton via useState
  const [queryClient] = useState(createQueryClient);
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full flex flex-col bg-white">
        <ErrorBoundary>
          <TooltipProvider>
            <QueryClientProvider client={queryClient}>
              <FeedMindRuntimeProvider>
                <Outlet />
              </FeedMindRuntimeProvider>
              <TanStackQueryDevtools />
            </QueryClientProvider>
          </TooltipProvider>
        </ErrorBoundary>
        <Toaster richColors closeButton position="top-center" />
        <Scripts />
        <TanStackRouterDevtools />
      </body>
    </html>
  );
}
