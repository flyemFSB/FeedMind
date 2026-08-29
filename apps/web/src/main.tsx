import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { ChatProvider } from "@/lib/chat/chat-context";
import { ErrorBoundary } from "@/components/app-shell/error-boundary";
import { Toaster } from "@/components/ui/toast";
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
            <QueryClientProvider client={queryClient}>
              <ChatProvider>
                <RouterProvider router={router} />
                <TanStackQueryDevtools />
              </ChatProvider>
            </QueryClientProvider>
          </I18nProvider>
        </ThemeProvider>
      </ErrorBoundary>
      <Toaster />
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

// 渲染进程空闲 GC：desktop 端 --expose-gc 经 js-flags 对 renderer 生效，页面可调 globalThis.gc()。
// GC 同步阻塞，只在页面隐藏（最小化/切走）且足够久后才触发，避免前台卡顿；
// 纯浏览器运行（无 --expose-gc）时 gc 为 undefined，?.() 静默跳过，无需环境判断。
function idleRendererGC(): () => void {
  let hiddenTimer: number | undefined;
  const gc = () => {
    try {
      globalThis.gc?.();
    } catch {
      // 某些环境 gc 存在但被禁用，忽略
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // 隐藏后 30 秒再回收：等页面离屏动画/清理任务结束，避免边清理边回收
      hiddenTimer = window.setTimeout(gc, 30_000);
    } else if (hiddenTimer) {
      window.clearTimeout(hiddenTimer);
      hiddenTimer = undefined;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  // 长会话防膨胀：每小时在后台时兜底回收一次（页面可见时不触发，避免前台停顿）
  const periodicTimer = window.setInterval(
    () => {
      if (document.visibilityState === "hidden") gc();
    },
    60 * 60 * 1000,
  );
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (hiddenTimer) window.clearTimeout(hiddenTimer);
    if (periodicTimer) window.clearInterval(periodicTimer);
  };
}

idleRendererGC();
