import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { FeedMindRuntimeProvider } from "@/lib/assistant-runtime/provider";
import { SystemToast } from "@/components/app-shell/system-toast";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "FeedMind - AI Research Agent",
  description: "Task-driven trend research Agent system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={cn("h-full", "antialiased", "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white">
        <ErrorBoundary>
          <FeedMindRuntimeProvider>{children}</FeedMindRuntimeProvider>
        </ErrorBoundary>
        <SystemToast />
      </body>
    </html>
  );
}
