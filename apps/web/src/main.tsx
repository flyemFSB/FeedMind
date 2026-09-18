import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useState } from "react";
import { ChatProvider } from "@/app/agent-drawer/chat-context";
import { ErrorBoundary } from "@/app/shell/error-boundary";
import { Toaster } from "@/components/ui/toast";
import { ThemeProvider } from "@/app/theme-provider";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { createQueryClient } from "@/lib/query-client";
import { router } from "@/router";
import { TanStackQueryDevtools } from "@/devtools";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";

function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    // LazyMotion strict 模式：全应用严格限制仅允许使用 m.* 轻量组件（全量 motion.* 会引入完整的动画运行时从而增大包体积）。
    // domAnimation 覆盖本项目全部用法（变换/手势/AniPresence）；strict 下漏改的 motion.* 直接抛错而非静默不动画
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <ErrorBoundary>
          <ThemeProvider>
            <I18nextProvider i18n={i18n}>
              <QueryClientProvider client={queryClient}>
                <ChatProvider>
                  <RouterProvider router={router} />
                  <TanStackQueryDevtools />
                </ChatProvider>
              </QueryClientProvider>
            </I18nextProvider>
          </ThemeProvider>
        </ErrorBoundary>
        <Toaster />
      </MotionConfig>
    </LazyMotion>
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
