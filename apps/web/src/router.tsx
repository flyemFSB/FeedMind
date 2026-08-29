import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  // 悬停/聚焦即预载目标路由：桌面端同源 API 延迟低，切页近零等待
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
