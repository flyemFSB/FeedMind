import { createFileRoute } from "@tanstack/react-router";

/**
 * /chat 路由保留以兼容旧链接。
 * 实际渲染由全局 AppShell 接管：访问 /chat 会自动展开 Agent 抽屉
 * 并重定向到 /wiki 工作台。此组件仅在重定向前短暂存在。
 */
export const Route = createFileRoute("/chat")({
  component: () => null,
});
