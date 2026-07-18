import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { ChatProvider } from "@/lib/chat/chat-context";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/provider";
import { createQueryClient } from "@/lib/query-client";
import { router } from "@/src/router";
import { TanStackQueryDevtools } from "@/src/devtools";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";

function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <ThemeProvider>
          <I18nProvider>
            <TooltipProvider>
              <QueryClientProvider client={queryClient}>
                <ChatProvider>
                  <RouterProvider router={router} />
                  <TanStackQueryDevtools />
                </ChatProvider>
              </QueryClientProvider>
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </ErrorBoundary>
      <Toaster richColors closeButton position="top-center" />
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
